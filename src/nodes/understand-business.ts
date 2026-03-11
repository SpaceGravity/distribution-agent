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
  const allowedRoot = resolve('.');
  if (!absPath.startsWith(allowedRoot + '/') && absPath !== allowedRoot) {
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

  // Read tone examples if provided and parse into per-platform map
  let toneExamples: string | undefined;
  let platformToneMap: Record<string, string> | undefined;
  if (state.toneFilePath) {
    try {
      const tonePath = resolve(state.toneFilePath);
      // Validate tone file path against same allowed root
      if (!tonePath.startsWith(allowedRoot + '/') && tonePath !== allowedRoot) {
        throw new Error('Path traversal detected in tone file path.');
      }
      toneExamples = readFileSync(tonePath, 'utf-8');
      console.log(
        `[understandBusiness] Read tone file: ${tonePath} (${toneExamples.length} chars)`
      );

      // Parse into per-platform sections keyed by "## <platform>" headers
      platformToneMap = parseToneFileIntoPlatformMap(toneExamples);
      console.log(
        `[understandBusiness] Parsed tone map for platforms: ${Object.keys(platformToneMap).join(', ')}`
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
    platformToneMap,
  };
}

/**
 * Parse a tone examples file into a Record<string, string> keyed by platform.
 * Splits on `## <platform>` headers and stores each section's content.
 */
function parseToneFileIntoPlatformMap(
  content: string
): Record<string, string> {
  const map: Record<string, string> = {};
  const sections = content.split(/^## /m);

  for (const section of sections) {
    const trimmed = section.trim();
    if (!trimmed) continue;

    // First line is the platform name, rest is the content
    const newlineIdx = trimmed.indexOf('\n');
    if (newlineIdx === -1) continue;

    const platform = trimmed.slice(0, newlineIdx).trim().toLowerCase();
    const body = trimmed.slice(newlineIdx + 1).trim();

    // Skip the file title section (starts with "# Platform Reply Rules")
    if (platform.startsWith('#') || !body) continue;

    map[platform] = body;
  }

  return map;
}
