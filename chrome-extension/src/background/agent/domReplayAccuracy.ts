import { HistoryTreeProcessor } from '../browser/dom/history/service';
import type { DOMHistoryElement } from '../browser/dom/history/view';
import { DOMElementNode } from '../browser/dom/views';
import type { BrowserState } from '../browser/views';
import type { AgentStepHistory, AgentStepRecord } from './history';

export const DOM_REPLAY_ACCURACY_THRESHOLDS = {
  sameGui: 90,
  minorDrift: 80,
  sensitiveWorkflow: 100,
} as const;

export type DomReplayAccuracyStatus =
  | 'matched'
  | 'matched_with_new_index'
  | 'not_found'
  | 'ambiguous_match'
  | 'wrong_page'
  | 'unsupported_target';

export interface DomReplayTarget {
  stepIndex: number;
  actionIndex: number;
  actionName: string | null;
  originalIndex: number | null;
  historicalElement: DOMHistoryElement;
  historicalUrl: string | null;
  historicalTitle: string | null;
}

export interface DomReplayTargetResult extends DomReplayTarget {
  status: DomReplayAccuracyStatus;
  currentIndex: number | null;
  matchCount: number;
  reason: string;
}

export interface DomReplayFailure {
  stepIndex: number;
  actionIndex: number;
  actionName: string | null;
  status: Exclude<DomReplayAccuracyStatus, 'matched' | 'matched_with_new_index'>;
  reason: string;
}

export interface DomReplayAccuracyResult {
  totalTargets: number;
  matchedTargets: number;
  failedTargets: number;
  ambiguousTargets: number;
  indexChangedButRecovered: number;
  accuracyPercent: number;
  results: DomReplayTargetResult[];
  failures: DomReplayFailure[];
}

export interface DomReplayAccuracyOptions {
  requireSameUrl?: boolean;
}

interface ParsedReplayAction {
  actionName: string | null;
  originalIndex: number | null;
}

function normalizeUrl(url: string | null | undefined): string {
  return (url ?? '').trim();
}

function roundPercent(value: number): number {
  return Math.round(value * 100) / 100;
}

function parseReplayAction(historyItem: AgentStepRecord, actionIndex: number): ParsedReplayAction {
  if (!historyItem.modelOutput) {
    return { actionName: null, originalIndex: null };
  }

  try {
    const parsed = JSON.parse(historyItem.modelOutput) as {
      action?: Array<Record<string, Record<string, unknown> | null> | null>;
    };
    const action = parsed.action?.[actionIndex];
    if (!action || typeof action !== 'object') {
      return { actionName: null, originalIndex: null };
    }

    const actionName = Object.keys(action)[0] ?? null;
    if (!actionName) {
      return { actionName: null, originalIndex: null };
    }

    const actionArgs = action[actionName];
    const originalIndex =
      actionArgs && typeof actionArgs === 'object' && typeof actionArgs.index === 'number' ? actionArgs.index : null;

    return { actionName, originalIndex };
  } catch {
    return { actionName: null, originalIndex: null };
  }
}

export function extractDomReplayTargets(history: AgentStepHistory): DomReplayTarget[] {
  const targets: DomReplayTarget[] = [];

  for (const [stepIndex, historyItem] of history.history.entries()) {
    for (const [actionIndex, result] of historyItem.result.entries()) {
      if (!result.interactedElement) {
        continue;
      }

      const parsedAction = parseReplayAction(historyItem, actionIndex);
      targets.push({
        stepIndex,
        actionIndex,
        actionName: parsedAction.actionName,
        originalIndex: parsedAction.originalIndex ?? result.interactedElement.highlightIndex ?? null,
        historicalElement: result.interactedElement,
        historicalUrl: historyItem.state?.url ?? null,
        historicalTitle: historyItem.state?.title ?? null,
      });
    }
  }

  return targets;
}

async function findExactMatches(
  historicalElement: DOMHistoryElement,
  elementTree: DOMElementNode,
): Promise<DOMElementNode[]> {
  const matches: DOMElementNode[] = [];

  const visit = async (node: DOMElementNode): Promise<void> => {
    if (node.highlightIndex !== null) {
      const matched = await HistoryTreeProcessor.compareHistoryElementAndDomElement(historicalElement, node);
      if (matched) {
        matches.push(node);
      }
    }

    for (const child of node.children) {
      if (child instanceof DOMElementNode) {
        await visit(child);
      }
    }
  };

  await visit(elementTree);
  return matches;
}

export async function resolveDomReplayTarget(
  target: DomReplayTarget,
  currentState: BrowserState,
  options: DomReplayAccuracyOptions = {},
): Promise<DomReplayTargetResult> {
  if (options.requireSameUrl && normalizeUrl(target.historicalUrl) !== normalizeUrl(currentState.url)) {
    return {
      ...target,
      status: 'wrong_page',
      currentIndex: null,
      matchCount: 0,
      reason: `Historical URL "${target.historicalUrl ?? ''}" does not match current URL "${currentState.url}".`,
    };
  }

  if (!target.historicalElement || !currentState.elementTree) {
    return {
      ...target,
      status: 'unsupported_target',
      currentIndex: null,
      matchCount: 0,
      reason: 'Saved DOM target or current DOM tree is missing.',
    };
  }

  const matches = await findExactMatches(target.historicalElement, currentState.elementTree);

  if (matches.length === 0) {
    return {
      ...target,
      status: 'not_found',
      currentIndex: null,
      matchCount: 0,
      reason: 'No matching DOM element found in the current page.',
    };
  }

  if (matches.length > 1) {
    return {
      ...target,
      status: 'ambiguous_match',
      currentIndex: null,
      matchCount: matches.length,
      reason: `${matches.length} matching DOM elements were found.`,
    };
  }

  const [match] = matches;
  const currentIndex = match.highlightIndex;
  const indexChanged = target.originalIndex !== null && currentIndex !== target.originalIndex;

  return {
    ...target,
    status: indexChanged ? 'matched_with_new_index' : 'matched',
    currentIndex,
    matchCount: 1,
    reason: indexChanged
      ? `Matched target and recovered new highlight index ${currentIndex}.`
      : 'Matched target with the same highlight index.',
  };
}

export async function evaluateDomReplayAccuracy(
  history: AgentStepHistory,
  currentState: BrowserState,
  options: DomReplayAccuracyOptions = {},
): Promise<DomReplayAccuracyResult> {
  const targets = extractDomReplayTargets(history);
  const results = await Promise.all(targets.map(target => resolveDomReplayTarget(target, currentState, options)));

  const matchedTargets = results.filter(
    result => result.status === 'matched' || result.status === 'matched_with_new_index',
  ).length;
  const ambiguousTargets = results.filter(result => result.status === 'ambiguous_match').length;
  const indexChangedButRecovered = results.filter(result => result.status === 'matched_with_new_index').length;
  const failures = results
    .filter(
      (
        result,
      ): result is DomReplayTargetResult & {
        status: Exclude<DomReplayAccuracyStatus, 'matched' | 'matched_with_new_index'>;
      } => result.status !== 'matched' && result.status !== 'matched_with_new_index',
    )
    .map(result => ({
      stepIndex: result.stepIndex,
      actionIndex: result.actionIndex,
      actionName: result.actionName,
      status: result.status,
      reason: result.reason,
    }));

  return {
    totalTargets: targets.length,
    matchedTargets,
    failedTargets: failures.length,
    ambiguousTargets,
    indexChangedButRecovered,
    accuracyPercent: targets.length === 0 ? 0 : roundPercent((matchedTargets / targets.length) * 100),
    results,
    failures,
  };
}

export function meetsDomReplayAccuracyThreshold(
  result: DomReplayAccuracyResult,
  thresholdPercent: number = DOM_REPLAY_ACCURACY_THRESHOLDS.sameGui,
): boolean {
  return result.totalTargets > 0 && result.accuracyPercent >= thresholdPercent && result.ambiguousTargets === 0;
}
