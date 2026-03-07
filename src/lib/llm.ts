// Shared LLM instance for the Distribution Agent
// Uses Claude (Anthropic) for all reasoning tasks

import { ChatAnthropic } from '@langchain/anthropic';
import { CONFIG } from '../config.js';

export const llm = new ChatAnthropic({
  model: CONFIG.ANTHROPIC_MODEL,
});
