// generateIdeaCriteria node — Generates content + community-discovery search queries
// from idea understanding, incorporating rejection notes and evaluation history

import z from 'zod';
import type { DistributionState } from '../state.js';
import { SearchCriteriaSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { ideaCriteriaPrompt } from '../lib/prompts.js';

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

  const prompt = ideaCriteriaPrompt(
    state.ideaUnderstanding,
    state.ideaRejectionNotes.length > 0
      ? state.ideaRejectionNotes
      : undefined,
    state.evaluationHistory.length > 0
      ? state.evaluationHistory
      : undefined,
    state.userGuidance ?? undefined
  );

  const result = await structuredLlm.invoke(prompt);

  // Cap content queries to 5, community queries to 3
  result.searchCriteria.queries = result.searchCriteria.queries.slice(0, 5);
  result.communityQueries = result.communityQueries.slice(0, 3);

  console.log(
    `[generateIdeaCriteria] Generated ${result.searchCriteria.queries.length} content queries, ${result.communityQueries.length} community queries`
  );

  return {
    searchCriteria: result.searchCriteria,
    ideaCommunityQueries: result.communityQueries,
  };
}
