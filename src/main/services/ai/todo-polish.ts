import type { CommonAICLIOptions } from '@shared/types/ai';
import { requestHttpAIText } from './http-client';
import { resolveHttpAIConfig } from './http-config';
import { parseCLIOutput, spawnCLI, stripCodeFence } from './providers';

export interface TodoPolishOptions extends CommonAICLIOptions {
  text: string; // Raw requirement text to polish
  timeout: number; // in seconds
  prompt?: string; // Custom prompt template (with {text} placeholder)
}

export interface TodoPolishResult {
  success: boolean;
  title?: string;
  description?: string;
  error?: string;
}

/** Parse JSON output from AI (expects { title, description } format) */
function parsePolishOutput(raw: string): { title: string; description: string } | null {
  const cleaned = stripCodeFence(raw);

  // Try direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
      return { title: parsed.title.trim(), description: parsed.description.trim() };
    }
  } catch {
    // Try extracting JSON from text
    const jsonMatch = cleaned.match(/\{[\s\S]*?"title"[\s\S]*?"description"[\s\S]*?\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed && typeof parsed.title === 'string' && typeof parsed.description === 'string') {
          return { title: parsed.title.trim(), description: parsed.description.trim() };
        }
      } catch {
        // ignore
      }
    }
  }

  return null;
}

export async function polishTodoTask(options: TodoPolishOptions): Promise<TodoPolishResult> {
  const {
    text,
    timeout,
    provider,
    model,
    reasoningEffort,
    bare,
    claudeEffort,
    prompt: customPrompt,
  } = options;

  const defaultPrompt = `You are a task management assistant. Convert the following raw requirement text into a structured todo task.

Output a JSON object with exactly two fields:
- "title": A concise, action-oriented title (max 60 characters)
- "description": A clear, detailed description that is AI-agent-friendly. Include context, acceptance criteria, and any technical details from the input. Write it so an AI coding agent can understand and execute the task directly.

Important: Output ONLY the JSON object, no explanation, no markdown fences.

Raw requirement:
{text}`;

  const promptTemplate = customPrompt || defaultPrompt;
  const prompt = promptTemplate.replace(/\{text\}/g, () => text);

  if (provider === 'openai-http') {
    const resolvedConfig = resolveHttpAIConfig(options.httpConfigId);
    if (!resolvedConfig.config) {
      return { success: false, error: resolvedConfig.error ?? 'Missing HTTP model config' };
    }

    try {
      const responseText = await requestHttpAIText({
        config: resolvedConfig.config,
        prompt,
        timeoutMs: timeout * 1000,
      });
      const parsed = parsePolishOutput(responseText);
      if (parsed) {
        return { success: true, title: parsed.title, description: parsed.description };
      }
      return { success: false, error: 'Failed to parse AI output as JSON' };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return new Promise((resolve) => {
    const timeoutMs = timeout * 1000;

    const { proc, kill } = spawnCLI({
      provider,
      model,
      prompt,
      cwd: process.cwd(),
      reasoningEffort,
      bare,
      claudeEffort,
      outputFormat: 'json',
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      kill();
      resolve({ success: false, error: 'timeout' });
    }, timeoutMs);

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;

      if (code !== 0) {
        console.error(`[todo-polish] Exit code: ${code}, stderr: ${stderr}`);
        resolve({ success: false, error: stderr || `Exit code: ${code}` });
        return;
      }

      const result = parseCLIOutput(provider, stdout);

      if (result.success && result.text) {
        const parsed = parsePolishOutput(result.text);
        if (parsed) {
          resolve({ success: true, title: parsed.title, description: parsed.description });
        } else {
          resolve({ success: false, error: 'Failed to parse AI output as JSON' });
        }
      } else {
        resolve({ success: false, error: result.error || 'Unknown error' });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      console.error(`[todo-polish] Process error:`, err);
      resolve({ success: false, error: err.message });
    });
  });
}
