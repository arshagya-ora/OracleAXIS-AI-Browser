import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { z } from 'zod';

vi.mock('@extension/storage', async () => await import('../../../../../packages/storage/index'));

type StorageChangeListener = (changes: Record<string, { oldValue: unknown; newValue: unknown }>) => void;

function createStorageAreaMock() {
  const data: Record<string, unknown> = {};
  const listeners = new Set<StorageChangeListener>();

  return {
    data,
    async get(keys?: string[] | string) {
      if (Array.isArray(keys)) {
        return keys.reduce<Record<string, unknown>>((result, key) => {
          if (key in data) {
            result[key] = data[key];
          }
          return result;
        }, {});
      }

      if (typeof keys === 'string') {
        return keys in data ? { [keys]: data[keys] } : {};
      }

      return { ...data };
    },
    async set(update: Record<string, unknown>) {
      const changes = Object.entries(update).reduce<Record<string, { oldValue: unknown; newValue: unknown }>>(
        (result, [key, value]) => {
          result[key] = {
            oldValue: data[key],
            newValue: value,
          };
          return result;
        },
        {},
      );

      Object.assign(data, update);
      for (const listener of listeners) {
        listener(changes);
      }
    },
    onChanged: {
      addListener(listener: StorageChangeListener) {
        listeners.add(listener);
      },
      removeListener(listener: StorageChangeListener) {
        listeners.delete(listener);
      },
    },
    async setAccessLevel() {
      return undefined;
    },
  };
}

function installChromeMock() {
  const local = createStorageAreaMock();
  const session = createStorageAreaMock();
  const sync = createStorageAreaMock();

  vi.stubGlobal('chrome', {
    storage: {
      local,
      session,
      sync,
    },
  });
}

function createJsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
    },
  });
}

function createSseResponse(events: Array<unknown | '[DONE]'>): Response {
  const body = events
    .map(event => `data: ${event === '[DONE]' ? event : JSON.stringify(event)}\n\n`)
    .join('');

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

function createTestAgent(BaseAgentClass: any, schema: z.ZodTypeAny, chatLLM: unknown, provider: string) {
  return new (class extends BaseAgentClass {
    constructor() {
      super(schema, {
        chatLLM,
        context: {
          controller: new AbortController(),
        },
        prompt: {
          getSystemMessage: () => new SystemMessage('Return JSON only.'),
          getUserMessage: async () => new HumanMessage('Return JSON only.'),
        },
        provider,
      });
    }

    async execute() {
      return {
        id: 'test-agent',
        result: await this.invoke([new HumanMessage('Return JSON only.')]),
      };
    }

    usesManualJsonExtraction() {
      return !this.withStructuredOutput;
    }
  })();
}

const VALID_CONFIG = `
model_provider = "oca"
model = "oca/gpt-5.4"
profile = "gpt-5-4"
model_reasoning_effort = "xhigh"

[model_providers.oca]
base_url = "https://example.com/llm"
http_headers = { "client" = "codex-cli", "client-version" = "0" }
model = "oca/gpt-5.4"
name = "Oracle Code Assist"
wire_api = "responses"

[profiles.gpt-5-4]
model = "oca/gpt-5.4"
model_provider = "oca"
model_reasoning_effort = "xhigh"

[profiles.gpt-5-3-codex]
model = "oca/gpt-5.3-codex"
model_provider = "oca"
`;

const MISSING_PROVIDER_CONFIG = `
[model_providers.other]
base_url = "https://example.com/llm"
model = "other/model"
wire_api = "responses"
`;

const VALID_AUTH = JSON.stringify({
  auth_mode: 'apikey',
  OPENAI_API_KEY: 'codex-test-key',
});

beforeEach(() => {
  vi.resetModules();
  installChromeMock();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('codex oca import', () => {
  it('creates a preview from Codex config and resolves the active profile', async () => {
    const storage = await import('@extension/storage');

    const preview = storage.createCodexImportPreview(VALID_CONFIG, VALID_AUTH);

    expect(preview.providerId).toBe(storage.CODEX_OCA_PROVIDER_ID);
    expect(preview.providerKey).toBe('oca');
    expect(preview.providerName).toBe('Oracle Code Assist');
    expect(preview.baseUrl).toBe('https://example.com/llm');
    expect(preview.wireApi).toBe('responses');
    expect(preview.modelName).toBe('oca/gpt-5.4');
    expect(preview.modelNames).toEqual(expect.arrayContaining(['oca/gpt-5.4', 'oca/gpt-5.3-codex']));
    expect(preview.activeProfile).toBe('gpt-5-4');
    expect(preview.reasoningEffort).toBe('xhigh');
    expect(preview.providerConfig.type).toBe(storage.ProviderTypeEnum.OcaCodex);
    expect(preview.providerConfig.httpHeaders).toEqual({
      client: 'codex-cli',
      'client-version': '0',
    });
  });

  it('rejects malformed or incomplete import input without mutating providers or agent models', async () => {
    const storage = await import('@extension/storage');

    await storage.llmProviderStore.setProvider(storage.ProviderTypeEnum.OpenAI, {
      apiKey: 'openai-key',
      type: storage.ProviderTypeEnum.OpenAI,
      name: 'OpenAI',
      modelNames: ['gpt-5', 'gpt-5-mini'],
      createdAt: 1,
    });
    await storage.agentModelStore.setAgentModel(storage.AgentNameEnum.Planner, {
      provider: storage.ProviderTypeEnum.OpenAI,
      modelName: 'gpt-5',
      parameters: { temperature: 0.7, topP: 0.9 },
      reasoningEffort: 'low',
    });
    await storage.agentModelStore.setAgentModel(storage.AgentNameEnum.Navigator, {
      provider: storage.ProviderTypeEnum.OpenAI,
      modelName: 'gpt-5-mini',
      parameters: { temperature: 0.3, topP: 0.85 },
    });

    const providersBefore = JSON.parse(JSON.stringify(await storage.llmProviderStore.getAllProviders()));
    const agentModelsBefore = JSON.parse(JSON.stringify(await storage.agentModelStore.getAllAgentModels()));

    expect(() => storage.createCodexImportPreview(VALID_CONFIG, '{')).toThrow();
    expect(() => storage.createCodexImportPreview(MISSING_PROVIDER_CONFIG, VALID_AUTH)).toThrow(
      /model_providers\.oca/,
    );
    expect(() =>
      storage.createCodexImportPreview(
        VALID_CONFIG,
        JSON.stringify({
          auth_mode: 'apikey',
        }),
      ),
    ).toThrow(/OPENAI_API_KEY/);

    expect(await storage.llmProviderStore.getAllProviders()).toEqual(providersBefore);
    expect(await storage.agentModelStore.getAllAgentModels()).toEqual(agentModelsBefore);
  });

  it('applies the import additively and assigns planner and navigator on first import', async () => {
    const storage = await import('@extension/storage');

    await storage.llmProviderStore.setProvider(storage.ProviderTypeEnum.OpenAI, {
      apiKey: 'openai-key',
      type: storage.ProviderTypeEnum.OpenAI,
      name: 'OpenAI',
      modelNames: ['gpt-5'],
      createdAt: 1,
    });

    const preview = storage.createCodexImportPreview(VALID_CONFIG, VALID_AUTH);
    const result = await storage.applyCodexImport(preview);

    expect(result.firstImport).toBe(true);

    const providers = await storage.llmProviderStore.getAllProviders();
    expect(Object.keys(providers)).toEqual(expect.arrayContaining([storage.ProviderTypeEnum.OpenAI, storage.CODEX_OCA_PROVIDER_ID]));
    expect(providers[storage.ProviderTypeEnum.OpenAI]).toMatchObject({
      apiKey: 'openai-key',
      type: storage.ProviderTypeEnum.OpenAI,
      modelNames: ['gpt-5'],
    });
    expect(providers[storage.CODEX_OCA_PROVIDER_ID]).toMatchObject({
      type: storage.ProviderTypeEnum.OcaCodex,
      baseUrl: 'https://example.com/llm',
      wireApi: 'responses',
      source: 'codex_import',
      externalProviderKey: 'oca',
    });

    const plannerModel = await storage.agentModelStore.getAgentModel(storage.AgentNameEnum.Planner);
    const navigatorModel = await storage.agentModelStore.getAgentModel(storage.AgentNameEnum.Navigator);

    expect(plannerModel).toMatchObject({
      provider: storage.CODEX_OCA_PROVIDER_ID,
      modelName: 'oca/gpt-5.4',
      reasoningEffort: 'xhigh',
      parameters: {
        temperature: 0.7,
        topP: 0.9,
      },
    });
    expect(navigatorModel).toMatchObject({
      provider: storage.CODEX_OCA_PROVIDER_ID,
      modelName: 'oca/gpt-5.4',
      reasoningEffort: 'xhigh',
      parameters: {
        temperature: 0.3,
        topP: 0.85,
      },
    });
  });
});

describe('codex oca runtime', () => {
  it('routes only the Codex import provider through the responses adapter', async () => {
    const storage = await import('@extension/storage');
    const { createChatModel } = await import('../helper');

    const cases = [
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.OpenAI,
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.OpenAI,
          modelName: 'gpt-5',
          parameters: { temperature: 0.7, topP: 0.9 },
          reasoningEffort: 'high' as const,
        },
        expectedClass: 'ChatOpenAI',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.Gemini,
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.Gemini,
          modelName: 'gemini-2.5-pro',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatGoogleGenerativeAI',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.Grok,
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.Grok,
          modelName: 'grok-3',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatXAI',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.Groq,
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.Groq,
          modelName: 'llama-3.3-70b-versatile',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatGroq',
      },
      {
        providerConfig: {
          apiKey: 'ollama',
          type: storage.ProviderTypeEnum.Ollama,
          baseUrl: 'http://localhost:11434',
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.Ollama,
          modelName: 'qwen3:14b',
          parameters: { temperature: 0.3, topP: 0.9 },
        },
        expectedClass: 'ChatOllama',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.OpenRouter,
          baseUrl: 'https://openrouter.ai/api/v1',
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.OpenRouter,
          modelName: 'google/gemini-2.5-pro',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatOpenAI',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.Llama,
          baseUrl: 'https://api.llama.com/v1',
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.Llama,
          modelName: 'Llama-3.3-70B-Instruct',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatLlama',
      },
      {
        providerConfig: {
          apiKey: 'key',
          type: storage.ProviderTypeEnum.CustomOpenAI,
          baseUrl: 'https://custom.example.com/v1',
        },
        modelConfig: {
          provider: storage.ProviderTypeEnum.CustomOpenAI,
          modelName: 'custom-model',
          parameters: { temperature: 0.7, topP: 0.9 },
        },
        expectedClass: 'ChatOpenAI',
      },
      {
        providerConfig: {
          apiKey: 'codex-key',
          baseUrl: 'https://example.com/llm',
          modelNames: ['oca/gpt-5.4'],
          wireApi: 'responses',
          httpHeaders: { client: 'codex-cli' },
        },
        modelConfig: {
          provider: storage.CODEX_OCA_PROVIDER_ID,
          modelName: 'oca/gpt-5.4',
          parameters: { temperature: 0.7, topP: 0.9 },
          reasoningEffort: 'xhigh' as const,
        },
        expectedClass: 'OcaResponsesChatModel',
      },
    ];

    for (const testCase of cases) {
      const chatModel = createChatModel(testCase.providerConfig, testCase.modelConfig);
      expect(chatModel.constructor.name).toBe(testCase.expectedClass);
    }
  });

  it('uses manual JSON extraction with the existing planner and navigator schemas', async () => {
    const storage = await import('@extension/storage');
    const { BaseAgent } = await import('../agents/base');
    const { plannerOutputSchema } = await import('../agents/planner');
    const { NavigatorActionRegistry } = await import('../agents/navigator');
    const { OcaResponsesChatModel } = await import('../models/ocaResponses');
    const { Action } = await import('../actions/builder');
    const { doneActionSchema } = await import('../actions/schemas');
    const { ActionResult } = await import('../types');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const providerConfig = {
      apiKey: 'codex-key',
      baseUrl: 'https://example.com/llm',
      httpHeaders: { client: 'codex-cli', 'client-version': '0' },
      modelNames: ['oca/gpt-5.4'],
      type: storage.ProviderTypeEnum.OcaCodex,
      wireApi: 'responses',
    };
    const modelConfig = {
      provider: storage.CODEX_OCA_PROVIDER_ID,
      modelName: 'oca/gpt-5.4',
      parameters: { temperature: 0.7, topP: 0.9 },
      reasoningEffort: 'xhigh' as const,
    };
    const plannerPayload = {
      observation: 'Observed the page state.',
      challenges: 'No blocker.',
      done: false,
      next_steps: 'Continue to the next page.',
      final_answer: '',
      reasoning: 'Need one more step.',
      web_task: true,
    };
    const navigatorPayload = {
      current_state: {
        evaluation_previous_goal: 'Success',
        memory: 'Stored context',
        next_goal: 'Finish the task',
      },
      action: [
        {
          done: {
            text: 'Task complete',
            success: true,
          },
        },
      ],
    };

    fetchMock.mockResolvedValueOnce(
      createSseResponse([
        {
          id: 'resp_planner',
          output_text: JSON.stringify(plannerPayload),
        },
        '[DONE]',
      ]),
    );

    const plannerChatModel = new OcaResponsesChatModel(providerConfig, modelConfig);
    const plannerAgent = createTestAgent(BaseAgent, plannerOutputSchema, plannerChatModel, storage.CODEX_OCA_PROVIDER_ID);

    expect(plannerAgent.usesManualJsonExtraction()).toBe(true);
    await expect(plannerAgent.execute()).resolves.toMatchObject({
      result: plannerPayload,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).stream).toBe(true);

    const doneAction = new Action(async () => new ActionResult({ isDone: true }), doneActionSchema);
    const navigatorSchema = new NavigatorActionRegistry([doneAction]).setupModelOutputSchema();

    fetchMock.mockResolvedValueOnce(
      createSseResponse([
        {
          type: 'response.output_text.delta',
          delta: JSON.stringify(navigatorPayload).slice(0, 40),
        },
        {
          type: 'response.output_text.delta',
          delta: JSON.stringify(navigatorPayload).slice(40),
        },
        '[DONE]',
      ]),
    );

    const navigatorChatModel = new OcaResponsesChatModel(providerConfig, modelConfig);
    const navigatorAgent = createTestAgent(
      BaseAgent,
      navigatorSchema,
      navigatorChatModel,
      storage.CODEX_OCA_PROVIDER_ID,
    );

    expect(navigatorAgent.usesManualJsonExtraction()).toBe(true);
    await expect(navigatorAgent.execute()).resolves.toMatchObject({
      result: navigatorPayload,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body)).stream).toBe(true);
  });
});
