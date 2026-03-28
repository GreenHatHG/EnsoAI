export type AIProvider = 'claude-code' | 'codex-cli' | 'cursor-cli' | 'gemini-cli' | 'openai-http';

export type HttpAIRequestMode = 'responses' | 'chat_completions';

export const DEFAULT_HTTP_AI_BASE_URL = 'https://api.openai.com';
export const DEFAULT_HTTP_AI_MODE: HttpAIRequestMode = 'responses';

export interface HttpAIConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: HttpAIRequestMode;
  extraBody?: Record<string, unknown>;
  enabled?: boolean;
}

export interface HttpAIConfigTestRequest {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  mode?: HttpAIRequestMode;
  extraBody?: Record<string, unknown>;
}

export interface HttpAIConfigTestResult {
  success: boolean;
  latency?: number;
  error?: string;
}

export type ClaudeModelId = 'haiku' | 'sonnet' | 'opus';
export type CodexModelId = 'gpt-5.2' | 'gpt-5.2-codex';
export type CursorModelId = 'auto' | 'composer-1' | 'gpt-5.2' | 'sonnet-4.5' | 'opus-4.6';
export type GeminiModelId = 'gemini-3-pro-preview' | 'gemini-3-flash-preview';

export type ModelId = ClaudeModelId | CodexModelId | CursorModelId | GeminiModelId;

export type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

// Claude Code effort parameter for CI/CD optimization
// Controls how much effort Claude spends on reasoning (token usage vs quality)
// Requires Claude CLI 2.1.60+ for full support
export type ClaudeEffort = 'low' | 'medium' | 'high' | 'max' | 'auto';

// Common AI optimization options shared across settings and CLI operations
export interface AIOptimizationOptions {
  bare?: boolean;
  claudeEffort?: ClaudeEffort;
}

// Common AI settings interface for renderer store settings
export interface CommonAISettings extends AIOptimizationOptions {
  provider: AIProvider;
  model: string;
  reasoningEffort?: ReasoningEffort;
  httpConfigId?: string;
}

// Common AI CLI options for main process services
export interface CommonAICLIOptions extends AIOptimizationOptions {
  provider: AIProvider;
  model: ModelId;
  reasoningEffort?: ReasoningEffort;
  httpConfigId?: string;
}
