// Shared LLM instance for the Distribution Agent
// Uses Claude (Anthropic) for all reasoning tasks

import { ChatAnthropic } from '@langchain/anthropic';
import { CONFIG } from '../config.js';

export const llm = new ChatAnthropic({
  model: CONFIG.ANTHROPIC_MODEL,
});

/**
 * Wraps llm.withStructuredOutput().invoke() with try-catch and diagnostics.
 * On failure, logs error details and re-throws with a descriptive message.
 * Schema typed as `any` because Zod v4 + LangGraph registry extensions make
 * ZodType incompatible with plain z.object() schemas at the type level.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function safeStructuredInvoke<T = any>(
  schema: Parameters<typeof llm.withStructuredOutput>[0],
  prompt: string,
  nodeName: string
): Promise<T> {
  try {
    return await llm.withStructuredOutput(schema).invoke(prompt) as T;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errType = err instanceof Error ? err.constructor.name : typeof err;
    console.error(
      `[${nodeName}] LLM structured output failed (${errType}): ${errMsg}`
    );
    console.error(
      `[${nodeName}] Diagnostics: promptLength=${prompt.length}`
    );
    throw new Error(`[${nodeName}] LLM call failed: ${errType}: ${errMsg}`);
  }
}
