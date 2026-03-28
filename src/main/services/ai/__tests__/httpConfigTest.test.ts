import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_HTTP_AI_BASE_URL,
  DEFAULT_HTTP_AI_MODE,
  type HttpAIConfig,
  type HttpAIConfigTestRequest,
} from '../../../../shared/types';
import {
  HTTP_AI_CONFIG_TEST_PROMPT,
  HTTP_AI_CONFIG_TEST_TIMEOUT_MS,
  type HttpAITextRequester,
  testHttpAIConfig,
} from '../http-config-test';

function createStubRequester(
  output: string,
  capture?: (config: HttpAIConfig) => void
): HttpAITextRequester {
  return async ({ config, prompt, timeoutMs }) => {
    capture?.(config);
    expect(prompt).toBe(HTTP_AI_CONFIG_TEST_PROMPT);
    expect(timeoutMs).toBe(HTTP_AI_CONFIG_TEST_TIMEOUT_MS);
    return output;
  };
}

describe('testHttpAIConfig', () => {
  it('returns failure when api key is missing', async () => {
    const request: HttpAIConfigTestRequest = {
      baseUrl: 'https://api.openai.com',
      apiKey: '   ',
      model: 'gpt-5.2',
      mode: 'responses',
    };

    const result = await testHttpAIConfig(request);

    expect(result).toEqual({
      success: false,
      error: 'HTTP model config key is required',
    });
  });

  it('returns failure when model is missing', async () => {
    const request: HttpAIConfigTestRequest = {
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: '   ',
      mode: 'responses',
    };

    const result = await testHttpAIConfig(request);

    expect(result).toEqual({
      success: false,
      error: 'HTTP model config model is required',
    });
  });

  it('uses normalized config and returns success with latency', async () => {
    let capturedConfig: HttpAIConfig | undefined;
    const requestText = createStubRequester('OK', (config) => {
      capturedConfig = config;
    });

    const request: HttpAIConfigTestRequest = {
      baseUrl: ' https://api.openai.com/// ',
      apiKey: ' sk-test ',
      model: ' gpt-5.2 ',
      mode: 'chat_completions',
      extraBody: {
        reasoning_effort: 'medium',
      },
    };

    const result = await testHttpAIConfig(request, requestText);

    expect(result.success).toBe(true);
    expect(typeof result.latency).toBe('number');
    expect(result.latency).toBeGreaterThanOrEqual(0);
    expect(capturedConfig).toMatchObject({
      baseUrl: 'https://api.openai.com',
      apiKey: 'sk-test',
      model: 'gpt-5.2',
      mode: 'chat_completions',
      extraBody: {
        reasoning_effort: 'medium',
      },
      enabled: true,
    });
  });

  it('falls back to default baseUrl and mode when omitted', async () => {
    let capturedConfig: HttpAIConfig | undefined;
    const requestText = createStubRequester('OK', (config) => {
      capturedConfig = config;
    });

    const request: HttpAIConfigTestRequest = {
      apiKey: 'sk-test',
      model: 'gpt-5.2',
    };

    const result = await testHttpAIConfig(request, requestText);

    expect(result.success).toBe(true);
    expect(capturedConfig?.baseUrl).toBe(DEFAULT_HTTP_AI_BASE_URL);
    expect(capturedConfig?.mode).toBe(DEFAULT_HTTP_AI_MODE);
  });

  it('returns failure when model response text is empty', async () => {
    const request: HttpAIConfigTestRequest = {
      apiKey: 'sk-test',
      model: 'gpt-5.2',
    };

    const result = await testHttpAIConfig(request, createStubRequester('   '));

    expect(result).toEqual({
      success: false,
      error: 'HTTP model config test returned empty text',
    });
  });

  it('returns failure when requester throws', async () => {
    const request: HttpAIConfigTestRequest = {
      apiKey: 'sk-test',
      model: 'gpt-5.2',
    };

    const requestText = vi.fn(async () => {
      throw new Error('network failed');
    });

    const result = await testHttpAIConfig(request, requestText);

    expect(result).toEqual({
      success: false,
      error: 'network failed',
    });
  });
});
