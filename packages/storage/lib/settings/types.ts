// Agent name, used to identify the agent in the settings
export enum AgentNameEnum {
  Planner = 'planner',
  Navigator = 'navigator',
}

export const CODEX_OCA_PROVIDER_ID = 'codex_oca';
export const CODEX_SSO_PROVIDER_ID = 'codex_sso';
export const CODEX_SSO_DEFAULT_MODEL = 'codex-cli-default';
export const CODEX_SSO_DEFAULT_BRIDGE_URL = 'http://127.0.0.1:14550';

// Provider type, types before CustomOpenAI are built-in providers, CustomOpenAI is a custom provider
// For built-in providers, we will create ChatModel instances with its respective LangChain ChatModel classes
// For custom providers, we will create ChatModel instances with the ChatOpenAI class
export enum ProviderTypeEnum {
  OpenAI = 'openai',
  Gemini = 'gemini',
  Grok = 'grok',
  Ollama = 'ollama',
  OpenRouter = 'openrouter',
  Groq = 'groq',
  Llama = 'llama',
  OcaCodex = 'oca_codex',
  CodexSsoBridge = 'codex_sso_bridge',
  CustomOpenAI = 'custom_openai',
}

export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export function normalizeReasoningEffort(value: string | undefined): ReasoningEffort | undefined {
  if (!value) {
    return undefined;
  }

  if (value === 'minimal/none') {
    return 'minimal';
  }

  if (value === 'minimal' || value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }

  return undefined;
}

export function normalizeReasoningModelName(modelName: string): string {
  if (modelName.includes('>')) {
    const [, model] = modelName.split('>');
    return normalizeReasoningModelName(model);
  }

  if (modelName.startsWith('openai/')) {
    return modelName.substring(7);
  }

  if (modelName.startsWith('oca/')) {
    return modelName.substring(4);
  }

  return modelName;
}

export function isOpenAIReasoningModelName(modelName: string): boolean {
  const normalizedModelName = normalizeReasoningModelName(modelName);
  return (
    normalizedModelName.startsWith('o') ||
    (normalizedModelName.startsWith('gpt-5') && !normalizedModelName.startsWith('gpt-5-chat'))
  );
}

// Default supported models for each built-in provider
export const llmProviderModelNames = {
  [ProviderTypeEnum.OpenAI]: [
    'gpt-5.1',
    'gpt-5',
    'gpt-5-pro',
    'gpt-5-mini',
    'gpt-5-chat-latest',
    'gpt-4.1',
    'gpt-4.1-mini',
    'gpt-4o',
  ],
  [ProviderTypeEnum.Gemini]: ['gemini-3-pro-preview', 'gemini-2.5-flash', 'gemini-2.5-pro'],
  [ProviderTypeEnum.Grok]: ['grok-4', 'grok-4-fast-non-reasoning', 'grok-3', 'grok-3-fast'],
  [ProviderTypeEnum.Ollama]: ['qwen3:14b', 'falcon3:10b', 'qwen2.5-coder:14b', 'mistral-small:24b'],
  [ProviderTypeEnum.OpenRouter]: ['google/gemini-2.5-pro', 'google/gemini-2.5-flash', 'openai/gpt-4o-2024-11-20'],
  [ProviderTypeEnum.Groq]: ['llama-3.3-70b-versatile'],
  [ProviderTypeEnum.Llama]: [
    'Llama-3.3-70B-Instruct',
    'Llama-3.3-8B-Instruct',
    'Llama-4-Maverick-17B-128E-Instruct-FP8',
    'Llama-4-Scout-17B-16E-Instruct-FP8',
  ],
  [ProviderTypeEnum.OcaCodex]: [],
  [CODEX_OCA_PROVIDER_ID]: [],
  [ProviderTypeEnum.CodexSsoBridge]: [CODEX_SSO_DEFAULT_MODEL],
  [CODEX_SSO_PROVIDER_ID]: [CODEX_SSO_DEFAULT_MODEL],
  // Custom OpenAI providers don't have predefined models as they are user-defined
};

// Default parameters for each agent per provider, for providers not specified, use OpenAI parameters
export const llmProviderParameters = {
  [ProviderTypeEnum.OpenAI]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Gemini]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Grok]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Ollama]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.3,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.1,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.OpenRouter]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Groq]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.Llama]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.OcaCodex]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [CODEX_OCA_PROVIDER_ID]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [ProviderTypeEnum.CodexSsoBridge]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
  [CODEX_SSO_PROVIDER_ID]: {
    [AgentNameEnum.Planner]: {
      temperature: 0.7,
      topP: 0.9,
    },
    [AgentNameEnum.Navigator]: {
      temperature: 0.3,
      topP: 0.85,
    },
  },
};
