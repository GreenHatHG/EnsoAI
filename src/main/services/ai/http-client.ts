import type { HttpAIConfig, HttpAIRequestMode } from '@shared/types';

const RESPONSES_ENDPOINT_PATH = '/v1/responses';
const CHAT_COMPLETIONS_ENDPOINT_PATH = '/v1/chat/completions';
const SSE_DONE_MARKER = '[DONE]';
const SSE_EVENT_DELIMITER = /\r?\n\r?\n/;
const SSE_LINE_DELIMITER = /\r?\n/;
const SSE_DATA_PREFIX = 'data:';

export type HttpPayload = Record<string, unknown>;

export interface HttpTextRequestOptions {
  config: HttpAIConfig;
  prompt: string;
  timeoutMs: number;
}

export interface HttpStreamRequestOptions extends HttpTextRequestOptions {
  signal?: AbortSignal;
  onChunk: (chunk: string) => void;
}

function extractResponseOutputText(payload: HttpPayload): string {
  const outputText = payload.output_text;
  if (typeof outputText === 'string' && outputText.trim()) {
    return outputText;
  }

  const output = payload.output;
  if (Array.isArray(output)) {
    const chunks: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object') continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (!block || typeof block !== 'object') continue;
        const type = (block as { type?: unknown }).type;
        const text = (block as { text?: unknown }).text;
        if (type === 'output_text' && typeof text === 'string') {
          chunks.push(text);
        }
      }
    }
    if (chunks.length > 0) {
      return chunks.join('');
    }
  }

  return '';
}

function extractChatMessageText(payload: HttpPayload): string {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }

  const text = (first as { text?: unknown }).text;
  if (typeof text === 'string' && text.trim()) {
    return text;
  }

  const message = (first as { message?: unknown }).message;
  if (!message || typeof message !== 'object') {
    return '';
  }

  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string' && content.trim()) {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const partText = (item as { text?: unknown }).text;
      if (typeof partText === 'string') {
        chunks.push(partText);
      }
    }
    return chunks.join('');
  }

  return '';
}

function extractResponsesStreamDelta(payload: HttpPayload): string {
  if (payload.type === 'response.output_text.delta') {
    const delta = payload.delta;
    return typeof delta === 'string' ? delta : '';
  }
  return '';
}

function extractChatStreamDelta(payload: HttpPayload): string {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return '';
  }

  const first = choices[0];
  if (!first || typeof first !== 'object') {
    return '';
  }

  const delta = (first as { delta?: unknown }).delta;
  if (!delta || typeof delta !== 'object') {
    return '';
  }

  const content = (delta as { content?: unknown }).content;
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const chunks: string[] = [];
    for (const item of content) {
      if (!item || typeof item !== 'object') continue;
      const text = (item as { text?: unknown }).text;
      if (typeof text === 'string') {
        chunks.push(text);
      }
    }
    return chunks.join('');
  }

  return '';
}

export function buildHttpEndpoint(baseUrl: string, mode: HttpAIRequestMode): string {
  const normalized = baseUrl.replace(/\/+$/, '');
  return `${normalized}${mode === 'chat_completions' ? CHAT_COMPLETIONS_ENDPOINT_PATH : RESPONSES_ENDPOINT_PATH}`;
}

export function extractHttpResponseText(mode: HttpAIRequestMode, payload: HttpPayload): string {
  if (mode === 'chat_completions') {
    return extractChatMessageText(payload).trim();
  }
  return extractResponseOutputText(payload).trim();
}

export function extractHttpStreamDelta(mode: HttpAIRequestMode, payload: HttpPayload): string {
  if (mode === 'chat_completions') {
    return extractChatStreamDelta(payload);
  }
  return extractResponsesStreamDelta(payload);
}

export function buildHttpRequestBody(
  mode: HttpAIRequestMode,
  prompt: string,
  model: string,
  stream: boolean,
  extraBody?: Record<string, unknown>
): HttpPayload {
  const baseBody =
    mode === 'chat_completions'
      ? {
          model,
          messages: [{ role: 'user', content: prompt }],
          stream,
        }
      : {
          model,
          input: prompt,
          stream,
        };
  if (!extraBody) {
    return baseBody;
  }
  return {
    ...baseBody,
    ...extraBody,
  };
}

function parseSseMessages(buffer: string): { messages: string[]; remaining: string } {
  const events = buffer.split(SSE_EVENT_DELIMITER);
  const complete = events.slice(0, -1);
  const remaining = events.at(-1) ?? '';
  const messages: string[] = [];

  for (const event of complete) {
    if (!event.trim()) continue;
    const dataLines = event
      .split(SSE_LINE_DELIMITER)
      .map((line) => line.replace(/\r$/, ''))
      .filter((line) => line.startsWith(SSE_DATA_PREFIX))
      .map((line) => line.slice(SSE_DATA_PREFIX.length).trimStart());
    if (dataLines.length > 0) {
      messages.push(dataLines.join('\n'));
    }
  }

  return { messages, remaining };
}

function buildAuthorizationHeader(apiKey: string): string {
  return `Bearer ${apiKey}`;
}

function makeTimeoutController(timeoutMs: number): {
  controller: AbortController;
  clear: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

function mergeSignals(
  primary: AbortSignal,
  secondary?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  if (!secondary) {
    return { signal: primary, cleanup: () => {} };
  }

  const bridge = new AbortController();
  const abortBridge = () => bridge.abort();

  if (primary.aborted || secondary.aborted) {
    abortBridge();
  } else {
    primary.addEventListener('abort', abortBridge);
    secondary.addEventListener('abort', abortBridge);
  }

  return {
    signal: bridge.signal,
    cleanup: () => {
      primary.removeEventListener('abort', abortBridge);
      secondary.removeEventListener('abort', abortBridge);
    },
  };
}

export async function requestHttpAIText(options: HttpTextRequestOptions): Promise<string> {
  const { config, prompt, timeoutMs } = options;
  const { controller, clear } = makeTimeoutController(timeoutMs);
  try {
    const response = await fetch(buildHttpEndpoint(config.baseUrl, config.mode), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthorizationHeader(config.apiKey),
      },
      body: JSON.stringify(
        buildHttpRequestBody(config.mode, prompt, config.model, false, config.extraBody)
      ),
      signal: controller.signal,
    });

    if (!response.ok) {
      const reason = await response.text().catch(() => '');
      throw new Error(
        `[http-ai] request failed: ${response.status} ${response.statusText} ${reason}`.trim()
      );
    }

    const payload = (await response.json()) as HttpPayload;
    const text = extractHttpResponseText(config.mode, payload);
    if (!text) {
      throw new Error('[http-ai] empty response text');
    }
    return text;
  } finally {
    clear();
  }
}

export async function streamHttpAIText(options: HttpStreamRequestOptions): Promise<void> {
  const { config, prompt, timeoutMs, signal, onChunk } = options;
  const { controller, clear } = makeTimeoutController(timeoutMs);
  const { signal: mergedSignal, cleanup } = mergeSignals(controller.signal, signal);

  try {
    const response = await fetch(buildHttpEndpoint(config.baseUrl, config.mode), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: buildAuthorizationHeader(config.apiKey),
      },
      body: JSON.stringify(
        buildHttpRequestBody(config.mode, prompt, config.model, true, config.extraBody)
      ),
      signal: mergedSignal,
    });

    if (!response.ok) {
      const reason = await response.text().catch(() => '');
      throw new Error(
        `[http-ai] stream failed: ${response.status} ${response.statusText} ${reason}`.trim()
      );
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('[http-ai] empty stream body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSseMessages(buffer);
      buffer = parsed.remaining;

      for (const message of parsed.messages) {
        if (message === SSE_DONE_MARKER) {
          return;
        }
        let payload: HttpPayload;
        try {
          payload = JSON.parse(message) as HttpPayload;
        } catch {
          continue;
        }

        const delta = extractHttpStreamDelta(config.mode, payload);
        if (delta) {
          onChunk(delta);
        }
      }
    }

    buffer += decoder.decode();
    const parsed = parseSseMessages(`${buffer}\n\n`);
    for (const message of parsed.messages) {
      if (!message || message === SSE_DONE_MARKER) continue;
      try {
        const payload = JSON.parse(message) as HttpPayload;
        const delta = extractHttpStreamDelta(config.mode, payload);
        if (delta) {
          onChunk(delta);
        }
      } catch {
        // Ignore malformed trailing chunk.
      }
    }
  } finally {
    cleanup();
    clear();
  }
}
