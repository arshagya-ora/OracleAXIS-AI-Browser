import type { ModelConfig, ProviderConfig, ReasoningEffort } from '@extension/storage';
import { isOpenAIReasoningModelName, normalizeReasoningEffort } from '@extension/storage';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  type BaseMessage,
} from '@langchain/core/messages';
import { type BaseChatModelCallOptions, SimpleChatModel } from '@langchain/core/language_models/chat_models';

const MAX_OUTPUT_TOKENS = 1024 * 4;

type ResponsesCallOptions = BaseChatModelCallOptions & {
  signal?: AbortSignal;
};

type ResponsesInputContent =
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

type ResponsesInputMessage = {
  role: 'user' | 'assistant';
  content: ResponsesInputContent;
};

type ResponsesCreateRequest = {
  input: ResponsesInputMessage[];
  instructions?: string;
  max_output_tokens: number;
  model: string;
  stream?: boolean;
  reasoning?: {
    effort: ReasoningEffort;
  };
  temperature?: number;
  top_p?: number;
};

function buildResponsesUrl(baseUrl: string, queryParams?: Record<string, string>): string {
  const normalizedBaseUrl = baseUrl.trim().replace(/\/+$/, '');
  const responseUrl = normalizedBaseUrl.endsWith('/responses') ? normalizedBaseUrl : `${normalizedBaseUrl}/responses`;
  const url = new URL(responseUrl);

  if (queryParams) {
    for (const [key, value] of Object.entries(queryParams)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
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

function getHumanMessageContent(message: HumanMessage): ResponsesInputContent {
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

function normalizeMessages(messages: BaseMessage[]): { input: ResponsesInputMessage[]; instructions?: string } {
  const instructions: string[] = [];
  const input: ResponsesInputMessage[] = [];

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

function isUnsupportedSamplingParameterError(errorBody: unknown): boolean {
  if (!errorBody || typeof errorBody !== 'object') {
    return false;
  }

  const candidate = errorBody as { error?: { message?: string; param?: string }; message?: string; param?: string };
  const param = candidate.error?.param || candidate.param;
  const message = candidate.error?.message || candidate.message || '';

  return (
    param === 'temperature' ||
    param === 'top_p' ||
    (/unsupported parameter/i.test(message) && (message.includes('temperature') || message.includes('top_p')))
  );
}

function stripUtf8Bom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function parseEventStreamPayload(responseText: string): unknown {
  const events = responseText
    .split(/\r?\n\r?\n/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  let lastPayload: unknown;
  let lastResponsePayload: unknown;
  let outputText = '';

  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trimStart())
      .join('\n')
      .trim();

    if (!data || data === '[DONE]') {
      continue;
    }

    const payload = tryParseJson(data);
    if (payload === undefined) {
      continue;
    }

    lastPayload = payload;

    if (payload && typeof payload === 'object') {
      const candidate = payload as {
        type?: string;
        text?: string;
        delta?: string;
        output_text?: string;
        output?: unknown[];
        response?: unknown;
      };

      if (typeof candidate.output_text === 'string' || Array.isArray(candidate.output)) {
        lastResponsePayload = payload;
        continue;
      }

      if (
        (candidate.type === 'response.completed' ||
          candidate.type === 'response.incomplete' ||
          candidate.type === 'response.failed') &&
        candidate.response
      ) {
        lastResponsePayload = candidate.response;
        continue;
      }

      if (candidate.type === 'response.output_text.done' && typeof candidate.text === 'string') {
        outputText = candidate.text;
        continue;
      }

      if (candidate.type === 'response.output_text.delta' && typeof candidate.delta === 'string') {
        outputText += candidate.delta;
      }
    }
  }

  if (lastResponsePayload !== undefined) {
    return lastResponsePayload;
  }

  if (outputText.trim()) {
    return {
      output_text: outputText,
    };
  }

  if (lastPayload !== undefined) {
    return lastPayload;
  }

  throw new Error('Responses API returned an unreadable event stream');
}

async function parseResponsesBody(response: Response): Promise<unknown> {
  const responseText = stripUtf8Bom(await response.text()).trim();
  if (!responseText) {
    return {};
  }

  const jsonPayload = tryParseJson(responseText);
  if (jsonPayload !== undefined) {
    return jsonPayload;
  }

  if (responseText.startsWith('data:') || response.headers.get('Content-Type')?.includes('text/event-stream')) {
    return parseEventStreamPayload(responseText);
  }

  return responseText;
}

function extractOutputText(responseBody: unknown): string {
  if (!responseBody || typeof responseBody !== 'object') {
    throw new Error('Responses API returned an invalid payload');
  }

  const candidate = responseBody as {
    output?: Array<{
      content?: Array<{
        text?: string;
        type?: string;
      }>;
    }>;
    output_text?: string;
  };

  if (typeof candidate.output_text === 'string' && candidate.output_text.trim()) {
    return candidate.output_text;
  }

  const textParts: string[] = [];
  for (const outputItem of candidate.output || []) {
    for (const contentItem of outputItem.content || []) {
      if (
        (contentItem.type === 'output_text' || contentItem.type === 'text' || contentItem.type === undefined) &&
        typeof contentItem.text === 'string'
      ) {
        textParts.push(contentItem.text);
      }
    }
  }

  if (textParts.length > 0) {
    return textParts.join('\n');
  }

  throw new Error('Responses API did not return text output');
}

function normalizeOpenAIReasoningEffort(reasoningEffort: ReasoningEffort | undefined): ReasoningEffort | undefined {
  return normalizeReasoningEffort(reasoningEffort);
}

export class OcaResponsesChatModel extends SimpleChatModel<ResponsesCallOptions> {
  readonly modelName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly queryParams?: Record<string, string>;
  private readonly temperature: number;
  private readonly topP: number;
  private readonly reasoningEffort?: ReasoningEffort;

  constructor(providerConfig: ProviderConfig, modelConfig: ModelConfig) {
    super({});

    this.modelName = modelConfig.modelName;
    this.apiKey = providerConfig.apiKey;
    this.baseUrl = providerConfig.baseUrl || '';
    this.defaultHeaders = providerConfig.httpHeaders || {};
    this.queryParams = providerConfig.queryParams;
    this.temperature = (modelConfig.parameters?.temperature ?? 0.1) as number;
    this.topP = (modelConfig.parameters?.topP ?? 0.1) as number;
    this.reasoningEffort = normalizeOpenAIReasoningEffort(modelConfig.reasoningEffort);
  }

  _llmType(): string {
    return 'oca_responses';
  }

  async _call(messages: BaseMessage[], options: ResponsesCallOptions): Promise<string> {
    if (!this.baseUrl) {
      throw new Error('OCA/Codex provider is missing a base URL');
    }

    const { input, instructions } = normalizeMessages(messages);
    const requestBody: ResponsesCreateRequest = {
      input,
      instructions,
      max_output_tokens: MAX_OUTPUT_TOKENS,
      model: this.modelName,
      stream: true,
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

    const headers = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      ...this.defaultHeaders,
    };
    const responseUrl = buildResponsesUrl(this.baseUrl, this.queryParams);
    const sendRequest = () =>
      fetch(responseUrl, {
        body: JSON.stringify(requestBody),
        headers,
        method: 'POST',
        signal: options.signal,
      });

    let response = await sendRequest();

    if (!response.ok) {
      const errorBody = await parseResponsesBody(response);
      if (isUnsupportedSamplingParameterError(errorBody) && ('temperature' in requestBody || 'top_p' in requestBody)) {
        delete requestBody.temperature;
        delete requestBody.top_p;
        response = await sendRequest();

        if (response.ok) {
          const retryResponseBody = await parseResponsesBody(response);
          return extractOutputText(retryResponseBody);
        }

        const retryErrorBody = await parseResponsesBody(response);
        throw new Error(
          `Request failed with ${response.status} ${response.statusText}: ${extractErrorMessage(retryErrorBody)}`,
        );
      }

      throw new Error(`Request failed with ${response.status} ${response.statusText}: ${extractErrorMessage(errorBody)}`);
    }

    const responseBody = await parseResponsesBody(response);
    return extractOutputText(responseBody);
  }
}
