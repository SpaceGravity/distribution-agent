// getInput node — Collects user input via interrupt
// Asks for: business file path, platform selection, target count, tone file path

import { interrupt, Command } from '@langchain/langgraph';
import { existsSync } from 'fs';
import type { DistributionState } from '../state.js';
import { CONFIG } from '../config.js';

function parsePlatforms(input: unknown): string[] {
  const raw =
    typeof input === 'string'
      ? input.split(',').map((p: string) => p.trim().toLowerCase())
      : (input as string[]) ?? [];
  return raw.filter((p: string) =>
    (CONFIG.SUPPORTED_PLATFORMS as readonly string[]).includes(p)
  );
}

export async function getInput(
  state: DistributionState
): Promise<Partial<DistributionState> | Command> {
  // If idea path inputs already provided, skip interrupt
  if (state.mode === 'idea' && state.ideaFilePath) {
    console.log(
      `[getInput] Using pre-populated idea inputs: ${state.ideaFilePath}`
    );
    return new Command({
      update: {},
      goto: 'understandIdea',
    });
  }

  // If business path inputs already provided, skip interrupt
  if (state.businessFilePath && state.selectedPlatforms.length > 0) {
    console.log(
      `[getInput] Using pre-populated inputs: ${state.businessFilePath}`
    );
    return new Command({
      update: {
        mode: 'business',
        targetCount: state.targetCount ?? CONFIG.DEFAULT_TARGET_COUNT,
      },
      goto: 'understandBusiness',
    });
  }

  // Interrupt to collect inputs from the user
  const userInput = interrupt({
    action: 'Provide input to start the Distribution Agent',
    fields: {
      mode: 'Mode: "business" (product outreach) or "idea" (idea validation)',
      businessFilePath:
        'Path to your business description .md file (business mode)',
      ideaFilePath: 'Path to your idea .md file (idea mode)',
      selectedPlatforms: `Platforms to search (comma-separated): ${CONFIG.SUPPORTED_PLATFORMS.join(', ')}`,
      targetCount: `Number of targets to find (default: ${CONFIG.DEFAULT_TARGET_COUNT})`,
      toneFilePath: 'Path to tone examples .md file (optional, business mode)',
    },
  });

  const mode = (userInput.mode ?? 'business').toLowerCase().trim();

  // === IDEA MODE ===
  if (mode === 'idea') {
    const ideaPath = userInput.ideaFilePath?.trim();
    if (!ideaPath) {
      throw new Error('Idea file path is required for idea mode.');
    }
    if (!ideaPath.endsWith('.md')) {
      throw new Error('Idea file must be a .md file.');
    }
    if (!existsSync(ideaPath)) {
      throw new Error(`Idea file not found: ${ideaPath}`);
    }

    const validPlatforms = parsePlatforms(userInput.selectedPlatforms);

    return new Command({
      update: {
        mode: 'idea' as const,
        ideaFilePath: ideaPath,
        selectedPlatforms:
          validPlatforms.length > 0
            ? validPlatforms
            : [...CONFIG.SUPPORTED_PLATFORMS],
      },
      goto: 'understandIdea',
    });
  }

  // === BUSINESS MODE ===
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

  const validPlatforms = parsePlatforms(userInput.selectedPlatforms);
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
  const toneFileExists = tonePath ? existsSync(tonePath) : false;
  if (tonePath && !toneFileExists) {
    console.warn(`[getInput] Tone file not found: ${tonePath}, skipping`);
  }

  return new Command({
    update: {
      mode: 'business' as const,
      businessFilePath: bizPath,
      selectedPlatforms: validPlatforms,
      targetCount,
      toneFilePath: toneFileExists ? tonePath : undefined,
    },
    goto: 'understandBusiness',
  });
}
