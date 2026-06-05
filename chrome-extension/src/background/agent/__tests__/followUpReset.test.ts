import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemMessage } from '@langchain/core/messages';

vi.mock('@extension/storage/lib/chat', () => ({
  chatHistoryStore: {
    storeAgentStepHistory: vi.fn(),
    loadAgentStepHistory: vi.fn(),
  },
}));

vi.mock('../actions/builder', () => ({
  ActionBuilder: class MockActionBuilder {
    buildDefaultActions() {
      return [];
    }
  },
}));

vi.mock('../agents/navigator', () => ({
  NavigatorActionRegistry: class MockNavigatorActionRegistry {
    constructor() {}

    setupModelOutputSchema() {
      return {};
    }
  },
  NavigatorAgent: class MockNavigatorAgent {
    chatLLM: unknown;

    constructor(_registry: unknown, options: { chatLLM: unknown }) {
      this.chatLLM = options.chatLLM;
    }

    async execute() {
      return { id: 'navigator', result: { done: false } };
    }

    async addStateMessageToMemory() {
      return undefined;
    }

    async executeHistoryStep() {
      return [];
    }
  },
}));

vi.mock('../agents/planner', () => ({
  PlannerAgent: class MockPlannerAgent {
    chatLLM: unknown;

    constructor(options: { chatLLM: unknown }) {
      this.chatLLM = options.chatLLM;
    }

    async execute() {
      return { id: 'planner', result: { done: false } };
    }
  },
}));

vi.mock('../prompts/navigator', () => ({
  NavigatorPrompt: class MockNavigatorPrompt {
    constructor() {}

    getSystemMessage() {
      return new SystemMessage('system');
    }
  },
}));

vi.mock('../prompts/planner', () => ({
  PlannerPrompt: class MockPlannerPrompt {
    constructor() {}
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('cancel follow-up reset', () => {
  it('keeps a new controller alive when context is reset for follow-up', async () => {
    vi.useFakeTimers();

    const [{ AgentContext }, { EventManager }, { default: MessageManager }] = await Promise.all([
      import('../types'),
      import('../event/manager'),
      import('../messages/service'),
    ]);

    const context = new AgentContext('session-1', {} as never, new MessageManager(), new EventManager(), {});
    const originalController = context.controller;
    const abortSpy = vi.spyOn(originalController, 'abort');

    await context.stop();
    context.resetForFollowUp();

    const replacementController = context.controller;
    expect(replacementController).not.toBe(originalController);
    expect(context.stopped).toBe(false);
    expect(context.paused).toBe(false);

    vi.advanceTimersByTime(300);

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(replacementController.signal.aborted).toBe(false);
  });

  it('resets cancelled executor state before adding a follow-up task', async () => {
    vi.useFakeTimers();

    const [{ Executor }, { ActionResult }] = await Promise.all([import('../executor'), import('../types')]);

    const executor = new Executor('open amazon', 'session-1', {} as never, {} as never);
    const context = (executor as unknown as { context: any }).context;

    context.actionResults = [new ActionResult({ includeInMemory: false }), new ActionResult({ includeInMemory: true })];
    const initialMessageCount = context.messageManager.length();
    const originalController = context.controller;
    const abortSpy = vi.spyOn(originalController, 'abort');

    await executor.cancel();
    expect(context.stopped).toBe(true);

    executor.addFollowUpTask('continue');

    expect(context.stopped).toBe(false);
    expect(context.controller).not.toBe(originalController);
    expect(context.messageManager.length()).toBeGreaterThan(initialMessageCount);
    expect(context.actionResults).toHaveLength(1);
    expect((executor as unknown as { tasks: string[] }).tasks).toEqual(['open amazon', 'continue']);

    vi.advanceTimersByTime(300);

    expect(abortSpy).toHaveBeenCalledOnce();
    expect(context.controller.signal.aborted).toBe(false);
  });

  it('refreshes planner and navigator models for follow-up without losing message history', async () => {
    const [{ Executor }] = await Promise.all([import('../executor')]);

    const initialNavigatorModel = { id: 'navigator-initial' } as never;
    const initialPlannerModel = { id: 'planner-initial' } as never;
    const refreshedNavigatorModel = { id: 'navigator-refreshed' } as never;
    const refreshedPlannerModel = { id: 'planner-refreshed' } as never;

    const executor = new Executor('open amazon', 'session-1', {} as never, initialNavigatorModel, {
      plannerLLM: initialPlannerModel,
    });
    const stateBeforeRefresh = (executor as unknown as { context: any }).context.messageManager.length();

    executor.refreshModels(refreshedNavigatorModel, refreshedPlannerModel);

    expect((executor as unknown as { navigator: { chatLLM: unknown } }).navigator.chatLLM).toBe(refreshedNavigatorModel);
    expect((executor as unknown as { planner: { chatLLM: unknown } }).planner.chatLLM).toBe(refreshedPlannerModel);
    expect((executor as unknown as { context: any }).context.messageManager.length()).toBe(stateBeforeRefresh);
  });
});
