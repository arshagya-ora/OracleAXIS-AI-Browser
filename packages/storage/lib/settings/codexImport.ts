import { agentModelStore } from './agentModels';
import { getDefaultAgentModelParams, llmProviderStore, type ProviderConfig } from './llmProviders';
import {
  AgentNameEnum,
  CODEX_OCA_PROVIDER_ID,
  type ReasoningEffort,
  ProviderTypeEnum,
  isOpenAIReasoningModelName,
  normalizeReasoningEffort,
} from './types';

type TomlPrimitive = string | number | boolean;
type TomlValue = TomlPrimitive | TomlTable;

interface TomlTable {
  [key: string]: TomlValue;
}

interface ParsedCodexProviderConfig {
  baseUrl?: string;
  httpHeaders?: Record<string, string>;
  model?: string;
  name?: string;
  queryParams?: Record<string, string>;
  wireApi?: string;
}

interface ParsedCodexProfile {
  model?: string;
  modelProvider?: string;
  reasoningEffort?: ReasoningEffort;
}

interface ParsedCodexConfig {
  model?: string;
  modelProvider?: string;
  profile?: string;
  reasoningEffort?: ReasoningEffort;
  modelProviders: Record<string, ParsedCodexProviderConfig>;
  profiles: Record<string, ParsedCodexProfile>;
}

interface ParsedCodexAuth {
  authMode?: string;
  apiKey?: string;
}

export interface CodexImportPreview {
  providerId: typeof CODEX_OCA_PROVIDER_ID;
  providerKey: string;
  providerName: string;
  baseUrl: string;
  wireApi: string;
  modelName: string;
  modelNames: string[];
  reasoningEffort?: ReasoningEffort;
  activeProfile?: string;
  providerConfig: ProviderConfig;
}

function stripTomlComment(line: string): string {
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const previousChar = index > 0 ? line[index - 1] : '';

    if (char === "'" && !inDoubleQuote && previousChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote && previousChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === '#' && !inSingleQuote && !inDoubleQuote) {
      return line.slice(0, index);
    }
  }

  return line;
}

function splitTomlInlineEntries(value: string): string[] {
  const entries: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const previousChar = index > 0 ? value[index - 1] : '';

    if (char === "'" && !inDoubleQuote && previousChar !== '\\') {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote && previousChar !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '{' || char === '[') {
        depth += 1;
      } else if (char === '}' || char === ']') {
        depth = Math.max(depth - 1, 0);
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          entries.push(current.trim());
        }
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    entries.push(current.trim());
  }

  return entries;
}

function parseTomlString(value: string): string {
  if (value.startsWith('"') && value.endsWith('"')) {
    return JSON.parse(value) as string;
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1);
  }

  return value;
}

function parseInlineTable(value: string): TomlTable {
  const normalizedValue = value.trim();
  if (!normalizedValue.startsWith('{') || !normalizedValue.endsWith('}')) {
    throw new Error('Invalid inline table');
  }

  const innerValue = normalizedValue.slice(1, -1).trim();
  if (!innerValue) {
    return {};
  }

  const result: TomlTable = {};
  for (const entry of splitTomlInlineEntries(innerValue)) {
    const separatorIndex = entry.indexOf('=');
    if (separatorIndex === -1) {
      throw new Error(`Invalid inline table entry: ${entry}`);
    }

    const rawKey = entry.slice(0, separatorIndex).trim();
    const rawValue = entry.slice(separatorIndex + 1).trim();
    result[parseTomlString(rawKey)] = parseTomlValue(rawValue);
  }

  return result;
}

function parseTomlValue(value: string): TomlValue {
  const normalizedValue = value.trim();

  if (normalizedValue.startsWith('{')) {
    return parseInlineTable(normalizedValue);
  }

  if (
    (normalizedValue.startsWith('"') && normalizedValue.endsWith('"')) ||
    (normalizedValue.startsWith("'") && normalizedValue.endsWith("'"))
  ) {
    return parseTomlString(normalizedValue);
  }

  if (normalizedValue === 'true') {
    return true;
  }

  if (normalizedValue === 'false') {
    return false;
  }

  if (/^-?\d+$/.test(normalizedValue)) {
    return Number.parseInt(normalizedValue, 10);
  }

  return normalizedValue;
}

function coerceStringRecord(value: TomlValue | undefined): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record: Record<string, string> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    if (typeof entryValue === 'object') {
      continue;
    }
    record[key] = String(entryValue);
  }

  return record;
}

function parseCodexConfigToml(configText: string): ParsedCodexConfig {
  const config: ParsedCodexConfig = {
    modelProviders: {},
    profiles: {},
  };

  let currentSectionType: 'root' | 'model_provider' | 'profile' = 'root';
  let currentSectionName: string | null = null;

  for (const rawLine of configText.split(/\r?\n/)) {
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }

    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      const sectionName = sectionMatch[1].trim();
      if (sectionName.startsWith('model_providers.')) {
        currentSectionType = 'model_provider';
        currentSectionName = sectionName.substring('model_providers.'.length);
      } else if (sectionName.startsWith('profiles.')) {
        currentSectionType = 'profile';
        currentSectionName = sectionName.substring('profiles.'.length);
      } else {
        currentSectionType = 'root';
        currentSectionName = null;
      }
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = parseTomlValue(line.slice(separatorIndex + 1).trim());

    if (currentSectionType === 'root') {
      if (key === 'model' && typeof value === 'string') {
        config.model = value;
      } else if (key === 'model_provider' && typeof value === 'string') {
        config.modelProvider = value;
      } else if (key === 'profile' && typeof value === 'string') {
        config.profile = value;
      } else if (key === 'model_reasoning_effort' && typeof value === 'string') {
        config.reasoningEffort = normalizeReasoningEffort(value);
      }
      continue;
    }

    if (!currentSectionName) {
      continue;
    }

    if (currentSectionType === 'model_provider') {
      const provider = (config.modelProviders[currentSectionName] ||= {});
      if (key === 'base_url' && typeof value === 'string') {
        provider.baseUrl = value;
      } else if (key === 'http_headers') {
        provider.httpHeaders = coerceStringRecord(value);
      } else if (key === 'model' && typeof value === 'string') {
        provider.model = value;
      } else if (key === 'name' && typeof value === 'string') {
        provider.name = value;
      } else if (key === 'query_params') {
        provider.queryParams = coerceStringRecord(value);
      } else if (key === 'wire_api' && typeof value === 'string') {
        provider.wireApi = value;
      }
      continue;
    }

    const profile = (config.profiles[currentSectionName] ||= {});
    if (key === 'model' && typeof value === 'string') {
      profile.model = value;
    } else if (key === 'model_provider' && typeof value === 'string') {
      profile.modelProvider = value;
    } else if (key === 'model_reasoning_effort' && typeof value === 'string') {
      profile.reasoningEffort = normalizeReasoningEffort(value);
    }
  }

  return config;
}

function parseCodexAuthJson(authText: string): ParsedCodexAuth {
  const parsed = JSON.parse(authText) as Record<string, unknown>;
  return {
    authMode: typeof parsed.auth_mode === 'string' ? parsed.auth_mode : undefined,
    apiKey: typeof parsed.OPENAI_API_KEY === 'string' ? parsed.OPENAI_API_KEY : undefined,
  };
}

function addUniqueModel(models: string[], modelName: string | undefined): void {
  if (!modelName || models.includes(modelName)) {
    return;
  }

  models.push(modelName);
}

function referencesProvider(modelName: string | undefined, providerKey: string): boolean {
  return typeof modelName === 'string' && modelName.startsWith(`${providerKey}/`);
}

function collectImportedModels(config: ParsedCodexConfig, providerKey: string): string[] {
  const models: string[] = [];
  const providerConfig = config.modelProviders[providerKey];

  addUniqueModel(models, providerConfig?.model);

  if (config.modelProvider === providerKey || referencesProvider(config.model, providerKey)) {
    addUniqueModel(models, config.model);
  }

  for (const profile of Object.values(config.profiles)) {
    if (profile.modelProvider === providerKey || referencesProvider(profile.model, providerKey)) {
      addUniqueModel(models, profile.model);
    }
  }

  return models;
}

function resolveDefaultModel(config: ParsedCodexConfig, providerKey: string): {
  activeProfile?: string;
  modelName?: string;
  reasoningEffort?: ReasoningEffort;
} {
  const activeProfile = config.profile ? config.profiles[config.profile] : undefined;

  if (activeProfile) {
    const activeProfileUsesProvider =
      activeProfile.modelProvider === providerKey || referencesProvider(activeProfile.model, providerKey);
    if (activeProfileUsesProvider) {
      return {
        activeProfile: config.profile,
        modelName: activeProfile.model,
        reasoningEffort: activeProfile.reasoningEffort ?? config.reasoningEffort,
      };
    }
  }

  if (config.modelProvider === providerKey || referencesProvider(config.model, providerKey)) {
    return {
      activeProfile: config.profile,
      modelName: config.model,
      reasoningEffort: config.reasoningEffort,
    };
  }

  const providerConfig = config.modelProviders[providerKey];
  return {
    activeProfile: config.profile,
    modelName: providerConfig?.model,
    reasoningEffort: config.reasoningEffort,
  };
}

function resolveImportProviderKey(config: ParsedCodexConfig, fallbackProviderKey: string): string {
  const activeProfile = config.profile ? config.profiles[config.profile] : undefined;
  return activeProfile?.modelProvider || config.modelProvider || fallbackProviderKey;
}

export function createCodexImportPreview(
  configText: string,
  authText: string,
  fallbackProviderKey = 'oca',
): CodexImportPreview {
  const parsedConfig = parseCodexConfigToml(configText);
  const parsedAuth = parseCodexAuthJson(authText);
  const providerKey = resolveImportProviderKey(parsedConfig, fallbackProviderKey);
  const providerConfig = parsedConfig.modelProviders[providerKey];

  if (!providerConfig) {
    throw new Error(`Codex config does not define model_providers.${providerKey}`);
  }

  if (parsedAuth.authMode !== 'apikey') {
    throw new Error('Only Codex auth_mode="apikey" is supported for import');
  }

  if (!parsedAuth.apiKey?.trim()) {
    throw new Error('Codex auth.json does not contain OPENAI_API_KEY');
  }

  const wireApi = providerConfig.wireApi ?? 'responses';
  if (wireApi !== 'responses') {
    throw new Error(`Unsupported Codex wire_api "${wireApi}". Expected "responses"`);
  }

  if (!providerConfig.baseUrl?.trim()) {
    throw new Error(`Codex provider "${providerKey}" is missing base_url`);
  }

  const modelNames = collectImportedModels(parsedConfig, providerKey);
  const defaultModel = resolveDefaultModel(parsedConfig, providerKey);
  const modelName = defaultModel.modelName ?? modelNames[0];

  if (!modelName) {
    throw new Error(`Could not resolve a model for Codex provider "${providerKey}"`);
  }

  addUniqueModel(modelNames, modelName);

  const reasoningEffort =
    isOpenAIReasoningModelName(modelName) ? normalizeReasoningEffort(defaultModel.reasoningEffort) : undefined;

  const previewProviderConfig: ProviderConfig = {
    apiKey: parsedAuth.apiKey,
    baseUrl: providerConfig.baseUrl,
    createdAt: Date.now(),
    externalProviderKey: providerKey,
    httpHeaders: providerConfig.httpHeaders,
    modelNames,
    name: providerConfig.name || 'Oracle Code Assist',
    queryParams: providerConfig.queryParams,
    source: 'codex_import',
    type: ProviderTypeEnum.OcaCodex,
    wireApi,
  };

  return {
    activeProfile: defaultModel.activeProfile,
    baseUrl: providerConfig.baseUrl,
    modelName,
    modelNames,
    providerConfig: previewProviderConfig,
    providerId: CODEX_OCA_PROVIDER_ID,
    providerKey,
    providerName: previewProviderConfig.name || 'Oracle Code Assist',
    reasoningEffort,
    wireApi,
  };
}

export async function applyCodexImport(preview: CodexImportPreview): Promise<{ firstImport: boolean }> {
  const firstImport = !(await llmProviderStore.hasProvider(CODEX_OCA_PROVIDER_ID));
  await llmProviderStore.setProvider(CODEX_OCA_PROVIDER_ID, preview.providerConfig);

  if (!firstImport) {
    return { firstImport };
  }

  for (const agentName of [AgentNameEnum.Planner, AgentNameEnum.Navigator]) {
    await agentModelStore.setAgentModel(agentName, {
      modelName: preview.modelName,
      parameters: getDefaultAgentModelParams(CODEX_OCA_PROVIDER_ID, agentName),
      provider: CODEX_OCA_PROVIDER_ID,
      reasoningEffort: preview.reasoningEffort,
    });
  }

  return { firstImport };
}
