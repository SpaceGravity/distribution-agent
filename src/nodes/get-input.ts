// getInput node — Collects user input via interrupt
// Asks for: business file path, platform selection, target count, tone file path

import { interrupt, Command } from '@langchain/langgraph';
import { existsSync } from 'fs';
import type { DistributionState } from '../state.js';
import { CONFIG } from '../config.js';

export async function getInput(
  state: DistributionState
): Promise<Partial<DistributionState> | Command> {
  // If inputs already provided (e.g., via Studio initial state), skip interrupt
  if (state.businessFilePath && state.selectedPlatforms.length > 0) {
    console.log(
      `[getInput] Using pre-populated inputs: ${state.businessFilePath}`
    );
    return new Command({
      update: {
        targetCount: state.targetCount ?? CONFIG.DEFAULT_TARGET_COUNT,
      },
      goto: 'understandBusiness',
    });
  }

  // Interrupt to collect inputs from the user
  const userInput = interrupt({
    action: 'Provide input to start the Distribution Agent',
    fields: {
      businessFilePath: 'Path to your business description .md file',
      selectedPlatforms: `Platforms to search (comma-separated): ${CONFIG.SUPPORTED_PLATFORMS.join(', ')}`,
      targetCount: `Number of targets to find (default: ${CONFIG.DEFAULT_TARGET_COUNT})`,
      toneFilePath: 'Path to tone examples .md file (optional)',
    },
  });

  // Validate business file path
  const bizPath = userInput.businessFilePath?.trim();
  if (!bizPath) {
    throw new Error('Business file path is required.');
  }
  if (!bizPath.endsWith('.md')) {
    throw new Error('Business file must be a .md file.');
  }
  if (!existsSync(bizPath)) {
    throw new Error(`Business file not found: ${bizPath}`);
  }

  // Parse and validate platforms
  const rawPlatforms =
    typeof userInput.selectedPlatforms === 'string'
      ? userInput.selectedPlatforms.split(',').map((p: string) => p.trim().toLowerCase())
      : userInput.selectedPlatforms ?? [];

  const validPlatforms = rawPlatforms.filter((p: string) =>
    (CONFIG.SUPPORTED_PLATFORMS as readonly string[]).includes(p)
  );
  if (validPlatforms.length === 0) {
    throw new Error(
      `At least one valid platform is required. Options: ${CONFIG.SUPPORTED_PLATFORMS.join(', ')}`
    );
  }

  // Parse target count
  const targetCount =
    parseInt(userInput.targetCount) || CONFIG.DEFAULT_TARGET_COUNT;

  // Validate tone file if provided
  const tonePath = userInput.toneFilePath?.trim();
  if (tonePath && !existsSync(tonePath)) {
    console.warn(`[getInput] Tone file not found: ${tonePath}, skipping`);
  }

  return new Command({
    update: {
      businessFilePath: bizPath,
      selectedPlatforms: validPlatforms,
      targetCount,
      toneFilePath: tonePath && existsSync(tonePath) ? tonePath : undefined,
    },
    goto: 'understandBusiness',
  });
}
