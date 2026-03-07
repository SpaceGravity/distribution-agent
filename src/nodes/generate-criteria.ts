// generateCriteria node — Uses LLM to generate search keywords and queries
// from business understanding, incorporating evaluation history if in refinement loop

import type { DistributionState } from '../state.js';
import { SearchCriteriaSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { criteriaGenerationPrompt } from '../lib/prompts.js';

export async function generateCriteria(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.businessUnderstanding) {
    throw new Error('Business understanding not available in state.');
  }

  const structuredLlm = llm.withStructuredOutput(SearchCriteriaSchema);

  const prompt = criteriaGenerationPrompt(
    state.businessUnderstanding,
    state.evaluationHistory.length > 0
      ? state.evaluationHistory
      : undefined,
    state.userGuidance ?? undefined
  );

  const criteria = await structuredLlm.invoke(prompt);

  // Override platform filters with user's selection
  criteria.platformFilters = state.selectedPlatforms;

  console.log(
    `[generateCriteria] Generated ${criteria.keywords.length} keywords, ${criteria.queries.length} queries`
  );

  return { searchCriteria: criteria };
}
