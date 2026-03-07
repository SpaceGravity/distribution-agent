// refineSearch node — LLM generates improved search criteria from evaluation history
// Called when evaluate determines results are not satisfactory

import type { DistributionState } from '../state.js';
import { SearchCriteriaSchema } from '../state.js';
import { llm } from '../lib/llm.js';
import { criteriaGenerationPrompt } from '../lib/prompts.js';

export async function refineSearch(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.businessUnderstanding) {
    throw new Error('Business understanding not available in state.');
  }

  console.log(
    `[refineSearch] Refining criteria based on ${state.evaluationHistory.length} previous evaluations`
  );

  const structuredLlm = llm.withStructuredOutput(SearchCriteriaSchema);

  // Pass full evaluation history so the LLM avoids repeating failed strategies
  const prompt = criteriaGenerationPrompt(
    state.businessUnderstanding,
    state.evaluationHistory,
    state.userGuidance ?? undefined
  );

  const criteria = await structuredLlm.invoke(prompt);

  // Preserve user's platform selection
  criteria.platformFilters = state.selectedPlatforms;

  console.log(
    `[refineSearch] Refined to ${criteria.keywords.length} keywords, ${criteria.queries.length} queries`
  );

  return { searchCriteria: criteria };
}
