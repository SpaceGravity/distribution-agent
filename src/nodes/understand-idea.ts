// understandIdea node — Reads idea.md and generates structured understanding
// Flexible extraction adapts to one-liner or detailed hypothesis

import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import type { DistributionState } from '../state.js';
import { IdeaUnderstandingSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { ideaUnderstandingPrompt } from '../lib/prompts.js';
import { CONFIG } from '../config.js';

export async function understandIdea(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  const filePath = state.ideaFilePath;
  if (!filePath) {
    throw new Error('Idea file path not set in state.');
  }

  // Validate and read idea file
  const absPath = resolve(filePath);
  const allowedRoot = resolve('.');
  if (!absPath.startsWith(allowedRoot)) {
    throw new Error('Path traversal detected in idea file path.');
  }
  if (!absPath.endsWith('.md')) {
    throw new Error('Idea file must be a .md file.');
  }

  const stats = statSync(absPath);
  if (stats.size > CONFIG.MAX_IDEA_FILE_SIZE) {
    throw new Error(
      `Idea file too large: ${stats.size} bytes (max ${CONFIG.MAX_IDEA_FILE_SIZE}).`
    );
  }

  const ideaContent = readFileSync(absPath, 'utf-8');
  console.log(
    `[understandIdea] Read idea file: ${absPath} (${ideaContent.length} chars)`
  );

  // Generate structured idea understanding via Claude
  const structuredLlm = llm.withStructuredOutput(IdeaUnderstandingSchema);
  const prompt = ideaUnderstandingPrompt(ideaContent);
  const understanding = await structuredLlm.invoke(prompt);

  console.log(
    `[understandIdea] Problem hypothesis: ${understanding.problemHypothesis.substring(0, 100)}...`
  );

  return { ideaUnderstanding: understanding };
}
