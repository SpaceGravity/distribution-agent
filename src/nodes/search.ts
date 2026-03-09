// search node — Calls last30days via subprocess for each query in the criteria
// Results are merged into state via the deduplication reducer

import type { DistributionState, SearchResultItem } from '../state.js';
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

  // Run all queries in parallel
  const settled = await Promise.allSettled(
    cappedQueries.map((query) => searchPlatforms(query, platformFilters, depth))
  );

  const allResults: SearchResultItem[] = [];
  const errors: string[] = [];
  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const query = cappedQueries[i];
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
      console.log(
        `[search] Query "${query.substring(0, 40)}..." returned ${result.value.length} results`
      );
    } else {
      const msg = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`Query "${query.substring(0, 40)}...": ${msg}`);
      console.error(`[search] Query failed: ${msg}`);
    }
  }

  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(`All ${errors.length} search queries failed:\n${errors.join('\n')}`);
  }

  if (errors.length > 0) {
    console.warn(`[search] ${errors.length}/${cappedQueries.length} queries failed, continuing with ${allResults.length} results from successful queries`);
  }

  console.log(`[search] Total results collected: ${allResults.length}`);

  // Return results — the reducer will deduplicate by id
  return { searchResults: allResults };
}
