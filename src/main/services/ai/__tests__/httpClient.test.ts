import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHttpEndpoint,
  buildHttpRequestBody,
  extractHttpResponseText,
  extractHttpStreamDelta,
  type HttpPayload,
  streamHttpAIText,
} from '../http-client';

const TEST_HTTP_CONFIG = {
  id: 'test-http-config',
  name: 'Test Config',
  baseUrl: 'https://api.openai.com',
  apiKey: 'sk-test',
  model: 'gpt-5.2',
  mode: 'responses' as const,
  enabled: true,
};

function createStreamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('buildHttpEndpoint', () => {
  it('builds responses endpoint with default path', () => {
    const endpoint = buildHttpEndpoint('https://api.openai.com', 'responses');
    expect(endpoint).toBe('https://api.openai.com/v1/responses');
  });

  it('builds chat completions endpoint with default path', () => {
    const endpoint = buildHttpEndpoint('https://api.openai.com/', 'chat_completions');
    expect(endpoint).toBe('https://api.openai.com/v1/chat/completions');
  });
});

describe('extractHttpResponseText', () => {
  it('extracts text from responses output_text field', () => {
    const payload: HttpPayload = {
      output_text: 'hello from responses',
    };
    expect(extractHttpResponseText('responses', payload)).toBe('hello from responses');
  });

  it('extracts text from chat choices message content', () => {
    const payload: HttpPayload = {
      choices: [{ message: { content: 'hello from chat' } }],
    };
    expect(extractHttpResponseText('chat_completions', payload)).toBe('hello from chat');
  });
});

describe('extractHttpStreamDelta', () => {
  it('extracts delta from responses stream event', () => {
    const event: HttpPayload = {
      type: 'response.output_text.delta',
      delta: 'abc',
    };
    expect(extractHttpStreamDelta('responses', event)).toBe('abc');
  });

  it('extracts delta from chat completions stream event', () => {
    const event: HttpPayload = {
      choices: [{ delta: { content: 'xyz' } }],
    };
    expect(extractHttpStreamDelta('chat_completions', event)).toBe('xyz');
  });
});

describe('buildHttpRequestBody', () => {
  it('merges responses payload with extraBody fields', () => {
    const body = buildHttpRequestBody('responses', 'hello', 'gpt-5.2', false, {
      reasoning_effort: 'medium',
      temperature: 0.2,
    });

    expect(body).toEqual({
      model: 'gpt-5.2',
      input: 'hello',
      stream: false,
      reasoning_effort: 'medium',
      temperature: 0.2,
    });
  });

  it('merges chat_completions payload with extraBody fields', () => {
    const body = buildHttpRequestBody('chat_completions', 'hello', 'gpt-5.2', true, {
      response_format: { type: 'json_object' },
    });

    expect(body).toEqual({
      model: 'gpt-5.2',
      messages: [{ role: 'user', content: 'hello' }],
      stream: true,
      response_format: { type: 'json_object' },
    });
  });

  it('lets extraBody override system fields', () => {
    const body = buildHttpRequestBody('responses', 'hello', 'gpt-5.2', false, {
      model: 'gpt-5.2-codex',
      stream: true,
      input: 'custom-input',
      reasoning_effort: 'high',
    });

    expect(body).toEqual({
      model: 'gpt-5.2-codex',
      input: 'custom-input',
      stream: true,
      reasoning_effort: 'high',
    });
  });
});

describe('streamHttpAIText', () => {
  it('parses responses stream with CRLF event delimiters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        'data: {"type":"response.output_text.delta","delta":"hello"}\r\n\r\n',
        'data: {"type":"response.output_text.delta","delta":" world"}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
      ])
    );

    const chunks: string[] = [];

    await streamHttpAIText({
      config: TEST_HTTP_CONFIG,
      prompt: 'test',
      timeoutMs: 5_000,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks.join('')).toBe('hello world');
  });

  it('handles CRLF delimiters split across chunks', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        'data: {"type":"response.output_text.delta","delta":"A"}\r\n',
        '\r\n',
        'data: {"type":"response.output_text.delta","delta":"B"}\r',
        '\n\r\n',
        'data: [DONE]\r\n\r\n',
      ])
    );

    const chunks: string[] = [];

    await streamHttpAIText({
      config: TEST_HTTP_CONFIG,
      prompt: 'test',
      timeoutMs: 5_000,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks.join('')).toBe('AB');
  });

  it('stops at DONE marker with CRLF delimiters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        'data: {"type":"response.output_text.delta","delta":"safe"}\r\n\r\n',
        'data: [DONE]\r\n\r\n',
        'data: {"type":"response.output_text.delta","delta":"ignored"}\r\n\r\n',
      ])
    );

    const chunks: string[] = [];

    await streamHttpAIText({
      config: TEST_HTTP_CONFIG,
      prompt: 'test',
      timeoutMs: 5_000,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks.join('')).toBe('safe');
  });

  it('keeps supporting LF delimiters', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      createStreamResponse([
        'data: {"type":"response.output_text.delta","delta":"lf"}\n\n',
        'data: {"type":"response.output_text.delta","delta":"-ok"}\n\n',
        'data: [DONE]\n\n',
      ])
    );

    const chunks: string[] = [];

    await streamHttpAIText({
      config: TEST_HTTP_CONFIG,
      prompt: 'test',
      timeoutMs: 5_000,
      onChunk: (chunk) => chunks.push(chunk),
    });

    expect(chunks.join('')).toBe('lf-ok');
  });
});
