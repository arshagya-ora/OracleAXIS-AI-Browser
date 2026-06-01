import { describe, expect, it } from 'vitest';
import { DOMElementNode } from '@src/background/browser/dom/views';
import { HistoryTreeProcessor } from '@src/background/browser/dom/history/service';
import { BrowserStateHistory, type BrowserState } from '@src/background/browser/views';
import { ActionResult } from '../types';
import { AgentStepHistory, AgentStepRecord } from '../history';
import {
  DOM_REPLAY_ACCURACY_THRESHOLDS,
  evaluateDomReplayAccuracy,
  extractDomReplayTargets,
  meetsDomReplayAccuracyThreshold,
} from '../domReplayAccuracy';

function element(params: {
  tagName: string;
  xpath: string;
  attributes?: Record<string, string>;
  highlightIndex?: number | null;
  children?: DOMElementNode[];
}): DOMElementNode {
  const node = new DOMElementNode({
    tagName: params.tagName,
    xpath: params.xpath,
    attributes: params.attributes ?? {},
    children: [],
    isVisible: true,
    isInteractive: params.highlightIndex !== null,
    isTopElement: true,
    isInViewport: true,
    highlightIndex: params.highlightIndex ?? null,
  });

  for (const child of params.children ?? []) {
    child.parent = node;
    node.children.push(child);
  }

  return node;
}

function browserState(elementTree: DOMElementNode, url = 'https://oracle.example/nf'): BrowserState {
  return {
    elementTree,
    selectorMap: new Map(),
    tabId: 1,
    url,
    title: 'Oracle NF',
    screenshot: null,
    scrollY: 0,
    scrollHeight: 1000,
    visualViewportHeight: 800,
    tabs: [{ id: 1, url, title: 'Oracle NF' }],
  };
}

function historyWithTarget(target: DOMElementNode, actionIndex = target.highlightIndex ?? 0): AgentStepHistory {
  const state = browserState(target.parent ?? target);
  const historicalElement = HistoryTreeProcessor.convertDomElementToHistoryElement(target);
  const modelOutput = JSON.stringify({
    current_state: {
      evaluation_previous_goal: 'Previous goal completed',
      memory: 'Opened the NF page',
      next_goal: 'Click the configured target',
    },
    action: [
      {
        click_element: {
          intent: 'Click configured target',
          index: actionIndex,
        },
      },
    ],
  });

  return new AgentStepHistory([
    new AgentStepRecord(
      modelOutput,
      [
        new ActionResult({
          interactedElement: historicalElement,
        }),
      ],
      new BrowserStateHistory(state),
    ),
  ]);
}

describe('DOM replay accuracy', () => {
  it('extracts DOM targets from saved action history', () => {
    const target = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    const root = element({ tagName: 'main', xpath: '/main', children: [target] });
    const history = historyWithTarget(target);

    expect(root.children).toHaveLength(1);
    expect(extractDomReplayTargets(history)).toMatchObject([
      {
        stepIndex: 0,
        actionIndex: 0,
        actionName: 'click_element',
        originalIndex: 4,
      },
    ]);
  });

  it('reports an exact DOM match as 100 percent accurate', async () => {
    const historicalTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    element({ tagName: 'main', xpath: '/main', children: [historicalTarget] });
    const history = historyWithTarget(historicalTarget);

    const currentTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    const currentRoot = element({ tagName: 'main', xpath: '/main', children: [currentTarget] });

    const result = await evaluateDomReplayAccuracy(history, browserState(currentRoot));

    expect(result.totalTargets).toBe(1);
    expect(result.matchedTargets).toBe(1);
    expect(result.accuracyPercent).toBe(100);
    expect(result.results[0].status).toBe('matched');
    expect(meetsDomReplayAccuracyThreshold(result, DOM_REPLAY_ACCURACY_THRESHOLDS.sameGui)).toBe(true);
  });

  it('counts a changed highlight index as recovered when the DOM reference still matches', async () => {
    const historicalTarget = element({
      tagName: 'input',
      xpath: '/main/input[1]',
      attributes: { name: 'nfName', 'aria-label': 'NF name' },
      highlightIndex: 3,
    });
    element({ tagName: 'main', xpath: '/main', children: [historicalTarget] });
    const history = historyWithTarget(historicalTarget, 3);

    const currentTarget = element({
      tagName: 'input',
      xpath: '/main/input[1]',
      attributes: { name: 'nfName', 'aria-label': 'NF name' },
      highlightIndex: 9,
    });
    const currentRoot = element({ tagName: 'main', xpath: '/main', children: [currentTarget] });

    const result = await evaluateDomReplayAccuracy(history, browserState(currentRoot));

    expect(result.matchedTargets).toBe(1);
    expect(result.indexChangedButRecovered).toBe(1);
    expect(result.results[0]).toMatchObject({
      status: 'matched_with_new_index',
      currentIndex: 9,
    });
  });

  it('reports a missing DOM target as not found', async () => {
    const historicalTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    element({ tagName: 'main', xpath: '/main', children: [historicalTarget] });
    const history = historyWithTarget(historicalTarget);

    const currentTarget = element({
      tagName: 'button',
      xpath: '/main/button[2]',
      attributes: { 'aria-label': 'Different action' },
      highlightIndex: 4,
    });
    const currentRoot = element({ tagName: 'main', xpath: '/main', children: [currentTarget] });

    const result = await evaluateDomReplayAccuracy(history, browserState(currentRoot));

    expect(result.matchedTargets).toBe(0);
    expect(result.failedTargets).toBe(1);
    expect(result.accuracyPercent).toBe(0);
    expect(result.failures[0]).toMatchObject({
      status: 'not_found',
      actionName: 'click_element',
    });
  });

  it('reports duplicate matches as ambiguous', async () => {
    const historicalTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    element({ tagName: 'main', xpath: '/main', children: [historicalTarget] });
    const history = historyWithTarget(historicalTarget);

    const firstCurrentTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    const secondCurrentTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 8,
    });
    const currentRoot = element({ tagName: 'main', xpath: '/main', children: [firstCurrentTarget, secondCurrentTarget] });

    const result = await evaluateDomReplayAccuracy(history, browserState(currentRoot));

    expect(result.ambiguousTargets).toBe(1);
    expect(result.failures[0].status).toBe('ambiguous_match');
    expect(meetsDomReplayAccuracyThreshold(result, DOM_REPLAY_ACCURACY_THRESHOLDS.minorDrift)).toBe(false);
  });

  it('can require the historical URL to match the current page URL', async () => {
    const historicalTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    element({ tagName: 'main', xpath: '/main', children: [historicalTarget] });
    const history = historyWithTarget(historicalTarget);

    const currentTarget = element({
      tagName: 'button',
      xpath: '/main/button[1]',
      attributes: { 'aria-label': 'Open alarms' },
      highlightIndex: 4,
    });
    const currentRoot = element({ tagName: 'main', xpath: '/main', children: [currentTarget] });

    const result = await evaluateDomReplayAccuracy(history, browserState(currentRoot, 'https://oracle.example/other'), {
      requireSameUrl: true,
    });

    expect(result.failedTargets).toBe(1);
    expect(result.failures[0].status).toBe('wrong_page');
  });
});
