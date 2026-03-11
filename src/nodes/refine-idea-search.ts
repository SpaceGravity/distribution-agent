// refineIdeaSearch node — Thin wrapper around generateIdeaCriteria
// Kept as a separate node for graph topology clarity (different log context)
// but delegates all logic to avoid duplication

import type { DistributionState } from '../state.js';
import { generateIdeaCriteria } from './generate-idea-criteria.js';

export async function refineIdeaSearch(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  console.log(
    `[refineIdeaSearch] Refining criteria based on ${state.evaluationHistory.length} previous evaluations`
  );

  return generateIdeaCriteria(state);
}
