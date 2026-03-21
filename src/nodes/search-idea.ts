// searchIdea node — Dual search strategy for idea validation
// Runs content queries on selected platforms + community-discovery queries on web

import type { DistributionState, SearchResultItem } from '../state.js';
import { searchPlatforms } from '../lib/search-runner.js';

export async function searchIdea(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.searchCriteria) {
    throw new Error('Search criteria not available in state.');
  }

  const { queries, depth } = state.searchCriteria;
  // Cap depth to 'default' — 'deep' causes timeout in last30days.py enrichment
  // (8 posts x ~30s each = 240s, exceeds the 120s future timeout)
  const effectiveDepth = depth === 'deep' ? 'default' : depth;
  // Use user's selected platforms, not LLM-generated platformFilters
  // Always include reddit — idea mode depends on community discovery
  const platformFilters = state.selectedPlatforms.includes('reddit')
    ? state.selectedPlatforms
    : [...state.selectedPlatforms, 'reddit'];
  const communityQueries = state.ideaCommunityQueries ?? [];

  // Cap content queries to 5
  const cappedContentQueries = queries.slice(0, 5);
  console.log(
    `[searchIdea] Running ${cappedContentQueries.length} content queries on ${platformFilters.join(', ')} + ${communityQueries.length} community queries on web`
  );

  // Run content queries on user-selected platforms
  const contentPromises = cappedContentQueries.map((query) =>
    searchPlatforms(query, platformFilters, effectiveDepth)
  );

  // Run community-discovery queries on web only
  const communityPromises = communityQueries.map((query) =>
    searchPlatforms(query, ['web'], 'default')
  );

  const settled = await Promise.allSettled([
    ...contentPromises,
    ...communityPromises,
  ]);

  const allResults: SearchResultItem[] = [];
  const errors: string[] = [];
  const allQueries = [...cappedContentQueries, ...communityQueries];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const query = allQueries[i];
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
      console.log(
        `[searchIdea] Query "${query.substring(0, 40)}..." returned ${result.value.length} results`
      );
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push(`Query "${query.substring(0, 40)}...": ${msg}`);
      console.error(`[searchIdea] Query failed: ${msg}`);
    }
  }

  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(
      `All ${errors.length} search queries failed:\n${errors.join('\n')}`
    );
  }

  if (errors.length > 0) {
    console.warn(
      `[searchIdea] ${errors.length}/${allQueries.length} queries failed, continuing with ${allResults.length} results`
    );
  }

  console.log(`[searchIdea] Total results collected: ${allResults.length}`);

  return { searchResults: allResults };
}
