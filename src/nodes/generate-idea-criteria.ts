// generateIdeaCriteria node — Generates content + community-discovery search queries
// from idea understanding, incorporating rejection notes and evaluation history

import z from 'zod';
import type { DistributionState } from '../state.js';
import { SearchCriteriaSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { ideaCriteriaPrompt } from '../lib/prompts.js';
import { loadCrossSessionMemory } from '../lib/memory.js';

const IdeaCriteriaOutputSchema = z.object({
  searchCriteria: SearchCriteriaSchema,
  communityQueries: z.array(z.string()),
});

export async function generateIdeaCriteria(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.ideaUnderstanding) {
    throw new Error('Idea understanding not available in state.');
  }

  const structuredLlm = llm.withStructuredOutput(IdeaCriteriaOutputSchema);
  const memory = loadCrossSessionMemory('idea');

  const prompt = ideaCriteriaPrompt(
    state.ideaUnderstanding,
    state.ideaRejectionNotes.length > 0
      ? state.ideaRejectionNotes
      : undefined,
    state.evaluationHistory.length > 0
      ? state.evaluationHistory
      : undefined,
    state.userGuidance ?? undefined,
    state.selectedPlatforms,
    state.backfillCount ?? undefined,
    memory
  );

  const result = await structuredLlm.invoke(prompt);

  // Cap content queries to 5, community queries to 3 (immutable — no in-place mutation)
  const cappedCriteria = {
    ...result.searchCriteria,
    queries: result.searchCriteria.queries.slice(0, 5),
  };
  const cappedCommunityQueries = result.communityQueries.slice(0, 3);

  console.log(
    `[generateIdeaCriteria] Generated ${cappedCriteria.queries.length} content queries, ${cappedCommunityQueries.length} community queries`
  );

  return {
    searchCriteria: cappedCriteria,
    ideaCommunityQueries: cappedCommunityQueries,
  };
}
