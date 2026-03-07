// understandBusiness node — Reads business .md file and generates structured understanding
// Also reads tone examples file if provided

import { readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import type { DistributionState } from '../state.js';
import { BusinessUnderstandingSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { businessUnderstandingPrompt } from '../lib/prompts.js';
import { CONFIG } from '../config.js';

export async function understandBusiness(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  const filePath = state.businessFilePath;
  if (!filePath) {
    throw new Error('Business file path not set in state.');
  }

  // Validate and read business file
  const absPath = resolve(filePath);
  if (absPath.includes('..')) {
    throw new Error('Path traversal detected in business file path.');
  }
  if (!absPath.endsWith('.md')) {
    throw new Error('Business file must be a .md file.');
  }

  const stats = statSync(absPath);
  if (stats.size > CONFIG.MAX_BUSINESS_FILE_SIZE) {
    throw new Error(
      `Business file too large: ${stats.size} bytes (max ${CONFIG.MAX_BUSINESS_FILE_SIZE}).`
    );
  }

  const businessContent = readFileSync(absPath, 'utf-8');
  console.log(
    `[understandBusiness] Read business file: ${absPath} (${businessContent.length} chars)`
  );

  // Read tone examples if provided
  let toneExamples: string | undefined;
  if (state.toneFilePath) {
    try {
      const tonePath = resolve(state.toneFilePath);
      toneExamples = readFileSync(tonePath, 'utf-8');
      console.log(
        `[understandBusiness] Read tone file: ${tonePath} (${toneExamples.length} chars)`
      );
    } catch (err) {
      console.warn(`[understandBusiness] Could not read tone file: ${err}`);
    }
  }

  // Generate structured business understanding via Claude
  const structuredLlm = llm.withStructuredOutput(
    BusinessUnderstandingSchema
  );
  const prompt = businessUnderstandingPrompt(businessContent);
  const understanding = await structuredLlm.invoke(prompt);

  console.log(
    `[understandBusiness] Generated understanding: ${understanding.summary.substring(0, 100)}...`
  );

  return {
    businessUnderstanding: understanding,
    toneExamples,
  };
}
