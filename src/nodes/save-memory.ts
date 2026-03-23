// saveMemory node — Logs run summary and persists cross-session memory

import type { DistributionState } from '../state.js';
import {
  extractAndSaveRejectionPatterns,
  saveSessionStrategy,
  savePreferences,
  saveSessionSummary,
} from '../lib/memory.js';

export async function saveMemory(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  const isIdeaMode = state.mode === 'idea';

  // Build category counts for idea mode summary
  let targetCategories: Record<string, number> | undefined;
  if (isIdeaMode && state.ideaTargets.length > 0) {
    targetCategories = {};
    for (const t of state.ideaTargets) {
      targetCategories[t.category] =
        (targetCategories[t.category] ?? 0) + 1;
    }
  }

  // Log run summary
  console.log('\n=== Distribution Agent Run Summary ===');
  console.log(`Mode: ${isIdeaMode ? 'idea' : 'business'}`);
  if (isIdeaMode) {
    console.log(
      `Idea: ${state.ideaUnderstanding?.problemHypothesis?.substring(0, 80) ?? 'unknown'}`
    );
    console.log(`Targets discovered: ${state.ideaTargets.length}`);
    if (targetCategories) {
      console.log(
        `Categories: ${Object.entries(targetCategories)
          .map(([k, v]) => `${k}: ${v}`)
          .join(', ')}`
      );
    }
    if (state.csvOutputPath) {
      console.log(`CSV exported: ${state.csvOutputPath}`);
    }
  } else {
    console.log(
      `Business: ${(state.businessUnderstanding?.summary ?? 'unknown').substring(0, 80)}`
    );
    console.log(`Replies generated: ${state.replyDrafts.length}`);
    console.log(`Replies posted: ${state.postedReplies.length}`);
  }
  console.log(`Platforms: ${state.selectedPlatforms.join(', ')}`);
  console.log(`Search iterations: ${state.iterationCount ?? 0}`);
  console.log(`Results found: ${state.searchResults.length}`);
  console.log('======================================\n');

  // Persist cross-session memory (non-critical — never blocks graph)
  try {
    const mode = isIdeaMode ? 'idea' as const : 'business' as const;

    await extractAndSaveRejectionPatterns(
      mode,
      isIdeaMode ? state.ideaRejectionNotes : state.targetRejectionNotes
    );
    saveSessionStrategy(mode, state);
    savePreferences(state);
    saveSessionSummary(mode, state);

    console.log('[saveMemory] Cross-session memory persisted.');
  } catch (err) {
    console.warn('[saveMemory] Failed to persist cross-session memory:', err);
  }

  return {};
}
