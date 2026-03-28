import {
  DEFAULT_HTTP_AI_BASE_URL,
  DEFAULT_HTTP_AI_MODE,
  type HttpAIConfig,
  type HttpAIConfigTestRequest,
  type HttpAIRequestMode,
} from '@shared/types';
import { readSettings } from '../../ipc/settings';

const SETTINGS_KEY = 'enso-settings';

interface SettingsStateShape {
  aiHttpConfigs?: HttpAIConfig[];
}

interface EnsoSettingsPayload {
  state?: SettingsStateShape;
}

interface SettingsPayload {
  [SETTINGS_KEY]?: EnsoSettingsPayload;
}

export interface HttpConfigResolution {
  config?: HttpAIConfig;
  error?: string;
}

const HTTP_AI_TEST_CONFIG_ID = '__http_ai_test_config__';

export interface HttpConfigValidationOptions {
  requireEnabled?: boolean;
}

export function normalizeHttpAIMode(mode: string | undefined): HttpAIRequestMode {
  return mode === 'chat_completions' ? 'chat_completions' : DEFAULT_HTTP_AI_MODE;
}

export function normalizeHttpAIBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim();
  if (!trimmed) {
    return DEFAULT_HTTP_AI_BASE_URL;
  }
  return trimmed.replace(/\/+$/, '');
}

function normalizeHttpAIExtraBody(extraBody: unknown): Record<string, unknown> | undefined {
  if (!extraBody || typeof extraBody !== 'object' || Array.isArray(extraBody)) {
    return undefined;
  }
  return { ...(extraBody as Record<string, unknown>) };
}

export function sanitizeHttpAIConfig(config: Partial<HttpAIConfig> & { id: string }): HttpAIConfig {
  return {
    id: config.id,
    name: (config.name ?? '').trim(),
    baseUrl: normalizeHttpAIBaseUrl(config.baseUrl),
    apiKey: (config.apiKey ?? '').trim(),
    model: (config.model ?? '').trim(),
    mode: normalizeHttpAIMode(config.mode),
    extraBody: normalizeHttpAIExtraBody(config.extraBody),
    enabled: config.enabled,
  };
}

export function buildHttpAIConfigForTest(request: HttpAIConfigTestRequest): HttpAIConfig {
  return sanitizeHttpAIConfig({
    id: HTTP_AI_TEST_CONFIG_ID,
    name: request.name ?? '',
    baseUrl: request.baseUrl,
    apiKey: request.apiKey,
    model: request.model,
    mode: request.mode,
    extraBody: request.extraBody,
    enabled: true,
  });
}

export function validateHttpAIConfig(
  config: HttpAIConfig,
  options: HttpConfigValidationOptions = {}
): string | undefined {
  if (options.requireEnabled && config.enabled === false) {
    return 'HTTP model config is disabled';
  }
  if (!config.apiKey) {
    return 'HTTP model config key is required';
  }
  if (!config.model) {
    return 'HTTP model config model is required';
  }
  return undefined;
}

export function getHttpAIConfigs(): HttpAIConfig[] {
  const payload = readSettings() as SettingsPayload | null;
  const list = payload?.[SETTINGS_KEY]?.state?.aiHttpConfigs ?? [];
  if (!Array.isArray(list)) {
    return [];
  }
  return list
    .filter((item) => !!item && typeof item === 'object' && typeof item.id === 'string')
    .map((item) => sanitizeHttpAIConfig(item as Partial<HttpAIConfig> & { id: string }));
}

export function resolveHttpAIConfig(configId: string | undefined): HttpConfigResolution {
  if (!configId) {
    return { error: 'Missing HTTP model config' };
  }

  const config = getHttpAIConfigs().find((item) => item.id === configId);
  if (!config) {
    return { error: 'HTTP model config not found' };
  }
  const validationError = validateHttpAIConfig(config, { requireEnabled: true });
  if (validationError) {
    return { error: validationError };
  }

  return { config };
}
