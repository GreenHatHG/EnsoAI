import type { HttpAIConfigTestRequest, HttpAIConfigTestResult } from '@shared/types';
import type { HttpTextRequestOptions } from './http-client';
import { requestHttpAIText } from './http-client';
import { buildHttpAIConfigForTest, validateHttpAIConfig } from './http-config';

export const HTTP_AI_CONFIG_TEST_PROMPT = 'Reply with OK only.';
export const HTTP_AI_CONFIG_TEST_TIMEOUT_MS = 10_000;

export type HttpAITextRequester = (options: HttpTextRequestOptions) => Promise<string>;

export async function testHttpAIConfig(
  request: HttpAIConfigTestRequest,
  requestText: HttpAITextRequester = requestHttpAIText
): Promise<HttpAIConfigTestResult> {
  const config = buildHttpAIConfigForTest(request);
  const validationError = validateHttpAIConfig(config);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const startedAt = Date.now();

  try {
    const text = await requestText({
      config,
      prompt: HTTP_AI_CONFIG_TEST_PROMPT,
      timeoutMs: HTTP_AI_CONFIG_TEST_TIMEOUT_MS,
    });

    if (!text.trim()) {
      return { success: false, error: 'HTTP model config test returned empty text' };
    }

    return {
      success: true,
      latency: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
