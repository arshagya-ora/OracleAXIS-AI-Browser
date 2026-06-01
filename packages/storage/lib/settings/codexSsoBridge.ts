import { agentModelStore } from './agentModels';
import { getDefaultAgentModelParams, llmProviderStore, type ProviderConfig } from './llmProviders';
import {
  AgentNameEnum,
  CODEX_SSO_DEFAULT_BRIDGE_URL,
  CODEX_SSO_DEFAULT_MODEL,
  CODEX_SSO_PROVIDER_ID,
  ProviderTypeEnum,
} from './types';

export interface CodexSsoBridgeConfigInput {
  baseUrl?: string;
  bridgeToken: string;
}

export function createCodexSsoBridgeProviderConfig(input: CodexSsoBridgeConfigInput): ProviderConfig {
  return {
    apiKey: '',
    baseUrl: input.baseUrl?.trim() || CODEX_SSO_DEFAULT_BRIDGE_URL,
    bridgeToken: input.bridgeToken.trim(),
    createdAt: Date.now(),
    modelNames: [CODEX_SSO_DEFAULT_MODEL],
    name: 'Codex SSO Local Bridge',
    source: 'codex_sso_bridge',
    type: ProviderTypeEnum.CodexSsoBridge,
  };
}

export async function applyCodexSsoBridgeProvider(
  providerConfig: ProviderConfig,
): Promise<{ firstImport: boolean }> {
  const firstImport = !(await llmProviderStore.hasProvider(CODEX_SSO_PROVIDER_ID));
  await llmProviderStore.setProvider(CODEX_SSO_PROVIDER_ID, providerConfig);

  if (!firstImport) {
    return { firstImport };
  }

  for (const agentName of [AgentNameEnum.Planner, AgentNameEnum.Navigator]) {
    await agentModelStore.setAgentModel(agentName, {
      modelName: CODEX_SSO_DEFAULT_MODEL,
      parameters: getDefaultAgentModelParams(CODEX_SSO_PROVIDER_ID, agentName),
      provider: CODEX_SSO_PROVIDER_ID,
    });
  }

  return { firstImport };
}
