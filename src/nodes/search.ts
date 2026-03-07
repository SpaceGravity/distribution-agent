// search node — Calls last30days via subprocess for each query in the criteria
// Results are merged into state via the deduplication reducer

import type { DistributionState } from '../state.js';
import { searchPlatforms } from '../lib/search-runner.js';

export async function search(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.searchCriteria) {
    throw new Error('Search criteria not available in state.');
  }

  const { queries, platformFilters, depth } = state.searchCriteria;

  // Cap queries to 5 max to avoid excessive search time
  const cappedQueries = queries.slice(0, 5);
  console.log(
    `[search] Searching ${platformFilters.join(', ')} with ${cappedQueries.length} queries (depth: ${depth})${queries.length > 5 ? ` (capped from ${queries.length})` : ''}`
  );

  // Run searches for each query and collect all results
  const allResults = [];
  for (const query of cappedQueries) {
    const results = await searchPlatforms(query, platformFilters, depth);
    allResults.push(...results);
    console.log(
      `[search] Query "${query.substring(0, 40)}..." returned ${results.length} results`
    );
  }

  console.log(`[search] Total results collected: ${allResults.length}`);

  // Return results — the reducer will deduplicate by id
  return { searchResults: allResults };
}
