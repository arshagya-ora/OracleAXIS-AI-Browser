import {
  type ApiReasoningEffort,
  CODEX_SSO_DEFAULT_BRIDGE_URL,
  type ModelConfig,
  type ProviderConfig,
  getCompatibleApiReasoningEffort,
  isOpenAIReasoningModelName,
} from '@extension/storage';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage, type BaseMessage } from '@langchain/core/messages';
import { type BaseChatModelCallOptions, SimpleChatModel } from '@langchain/core/language_models/chat_models';

const MAX_OUTPUT_TOKENS = 1024 * 4;

type BridgeCallOptions = BaseChatModelCallOptions & {
  signal?: AbortSignal;
};

type BridgeInputContent =
  | string
  | Array<
      | {
          type: 'input_text';
          text: string;
        }
      | {
          type: 'input_image';
          image_url: string;
        }
    >;

type BridgeInputMessage = {
  role: 'user' | 'assistant';
  content: BridgeInputContent;
};

type BridgeRequest = {
  input: BridgeInputMessage[];
  instructions?: string;
  max_output_tokens: number;
  model: string;
  reasoning?: {
    effort: ApiReasoningEffort;
  };
  temperature?: number;
  top_p?: number;
};

function buildBridgeUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/responses`;
}

function getTextContent(content: BaseMessage['content']): string {
  if (typeof content === 'string') {
    return content;
  }

  return content
    .map(item => {
      if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') {
        return item.text;
      }
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function getHumanMessageContent(message: HumanMessage): BridgeInputContent {
  if (typeof message.content === 'string') {
    return message.content;
  }

  const parts: Array<{ type: 'input_text'; text: string } | { type: 'input_image'; image_url: string }> = [];
  for (const item of message.content) {
    if (typeof item === 'object' && item !== null && 'image_url' in item) {
      const imageUrl = item.image_url?.url;
      if (typeof imageUrl === 'string') {
        parts.push({
          type: 'input_image',
          image_url: imageUrl,
        });
      }
      continue;
    }

    if (typeof item === 'object' && item !== null && 'text' in item && typeof item.text === 'string') {
      parts.push({
        type: 'input_text',
        text: item.text,
      });
    }
  }

  return parts.length > 0 ? parts : '';
}

function getAssistantMessageContent(message: AIMessage): string {
  if (message.tool_calls && message.tool_calls.length > 0) {
    return JSON.stringify(message.tool_calls);
  }

  return getTextContent(message.content);
}

function getToolMessageContent(message: ToolMessage): string {
  return typeof message.content === 'string' ? message.content : getTextContent(message.content);
}

function normalizeMessages(messages: BaseMessage[]): { input: BridgeInputMessage[]; instructions?: string } {
  const instructions: string[] = [];
  const input: BridgeInputMessage[] = [];

  for (const message of messages) {
    if (message instanceof SystemMessage) {
      const content = getTextContent(message.content);
      if (content) {
        instructions.push(content);
      }
      continue;
    }

    if (message instanceof HumanMessage) {
      input.push({
        role: 'user',
        content: getHumanMessageContent(message),
      });
      continue;
    }

    if (message instanceof ToolMessage) {
      input.push({
        role: 'user',
        content: getToolMessageContent(message),
      });
      continue;
    }

    if (message instanceof AIMessage) {
      input.push({
        role: 'assistant',
        content: getAssistantMessageContent(message),
      });
      continue;
    }

    input.push({
      role: 'user',
      content: getTextContent(message.content),
    });
  }

  return {
    input,
    instructions: instructions.length > 0 ? instructions.join('\n\n') : undefined,
  };
}

function extractErrorMessage(errorBody: unknown): string {
  if (typeof errorBody === 'string') {
    return errorBody;
  }

  if (errorBody && typeof errorBody === 'object') {
    const candidate = errorBody as { error?: { message?: string }; message?: string };
    if (candidate.error?.message) {
      return candidate.error.message;
    }

    if (candidate.message) {
      return candidate.message;
    }

    return JSON.stringify(candidate);
  }

  return 'Unknown error';
}

function isUnsupportedReasoningEffortError(errorBody: unknown): boolean {
  if (!errorBody || typeof errorBody !== 'object') {
    return false;
  }

  const candidate = errorBody as { error?: { message?: string; param?: string }; message?: string; param?: string };
  const param = (candidate.error?.param || candidate.param || '').toLowerCase();
  const message = (candidate.error?.message || candidate.message || '').toLowerCase();

  return (
    param === 'reasoning.effort' ||
    param === 'reasoning_effort' ||
    ((message.includes('reasoning.effort') || message.includes('reasoning_effort')) &&
      (message.includes('unsupported') || message.includes('not supported'))) ||
    (message.includes("'minimal'") && (message.includes('unsupported value') || message.includes('not supported')))
  );
}

async function parseBridgeBody(response: Response): Promise<unknown> {
  const responseText = await response.text();
  if (!responseText.trim()) {
    return {};
  }

  try {
    return JSON.parse(responseText);
  } catch {
    return responseText;
  }
}

function extractOutputText(responseBody: unknown): string {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('Codex SSO bridge returned an invalid payload');
  }

  const candidate = responseBody as { output_text?: string };
  if (typeof candidate.output_text === 'string') {
    return candidate.output_text;
  }

  throw new Error('Codex SSO bridge did not return output_text');
}

export class CodexSsoBridgeChatModel extends SimpleChatModel<BridgeCallOptions> {
  readonly modelName: string;
  private readonly baseUrl: string;
  private readonly bridgeToken: string;
  private readonly temperature: number;
  private readonly topP: number;
  private readonly reasoningEffort?: ApiReasoningEffort;

  constructor(providerConfig: ProviderConfig, modelConfig: ModelConfig) {
    super({});

    this.modelName = modelConfig.modelName;
    this.baseUrl = providerConfig.baseUrl || CODEX_SSO_DEFAULT_BRIDGE_URL;
    this.bridgeToken = providerConfig.bridgeToken || '';
    this.temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
    this.topP = (modelConfig.parameters?.topP ?? 0.1) as number;
    this.reasoningEffort = getCompatibleApiReasoningEffort(this.modelName, modelConfig.reasoningEffort);
  }

  _llmType(): string {
    return 'codex_sso_bridge';
  }

  async _call(messages: BaseMessage[], options: BridgeCallOptions): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('Codex SSO bridge provider is missing a base URL');
    }

    if (!this.bridgeToken) {
      throw new Error('Codex SSO bridge provider is missing a bridge token');
    }

    const { input, instructions } = normalizeMessages(messages);
    const requestBody: BridgeRequest = {
      input,
      instructions,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      model: this.modelName,
    };

    if (isOpenAIReasoningModelName(this.modelName)) {
      if (this.reasoningEffort) {
        requestBody.reasoning = {
          effort: this.reasoningEffort,
        };
      }
    } else {
      requestBody.temperature = this.temperature;
      requestBody.top_p = this.topP;
    }

    const sendRequest = () =>
      fetch(buildBridgeUrl(this.baseUrl), {
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json',
          'X-OC-Axis-Bridge-Token': this.bridgeToken,
        },
        method: 'POST',
        signal: options.signal,
      });

    let response = await sendRequest();
    let responseBody = await parseBridgeBody(response);

    if (!response.ok && isUnsupportedReasoningEffortError(responseBody) && requestBody.reasoning) {
      delete requestBody.reasoning;
      response = await sendRequest();
      responseBody = await parseBridgeBody(response);
    }

    if (!response.ok) {
      throw new Error(
        `Codex SSO bridge request failed with ${response.status} ${response.statusText}: ${extractErrorMessage(
          responseBody,
        )}`,
      );
    }

    return extractOutputText(responseBody);
  }
}
