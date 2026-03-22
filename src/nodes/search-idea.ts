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

  const { queries } = state.searchCriteria;
  // Force 'quick' depth for idea path content queries — last30days.py 'default'
  // depth enriches top 5 posts with comments, which takes 90s+ and triggers
  // the script's global 180s timeout. Even when Reddit finds 80-120 posts,
  // the enrichment timeout discards ALL results. 'quick' skips enrichment.
  const effectiveDepth = 'quick' as const;
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

  // Run content queries — one call per platform per query so a single
  // platform timeout (e.g. X rate-limited) doesn't kill the others.
  // Without this, --search=reddit,x runs both in one process; X's 60s
  // timeout triggers the global 90s kill, discarding Reddit's results too.
  const contentPromises: Array<{ query: string; platform: string; promise: Promise<SearchResultItem[]> }> = [];
  for (const query of cappedContentQueries) {
    for (const platform of platformFilters) {
      contentPromises.push({
        query,
        platform,
        promise: searchPlatforms(query, [platform], effectiveDepth),
      });
    }
  }

  // Run community-discovery queries on web only
  const communityPromises = communityQueries.map((query) => ({
    query,
    platform: 'web',
    promise: searchPlatforms(query, ['web'], 'default'),
  }));

  const allPromises = [...contentPromises, ...communityPromises];
  const settled = await Promise.allSettled(allPromises.map((p) => p.promise));

  const allResults: SearchResultItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const { query, platform } = allPromises[i];
    const label = `[${platform}] "${query.substring(0, 35)}..."`;
    if (result.status === 'fulfilled') {
      allResults.push(...result.value);
      console.log(
        `[searchIdea] ${label} returned ${result.value.length} results`
      );
    } else {
      const msg =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push(`${label}: ${msg}`);
      console.error(`[searchIdea] ${label} failed: ${msg}`);
    }
  }

  if (allResults.length === 0 && errors.length > 0) {
    throw new Error(
      `All ${errors.length} search queries failed:\n${errors.join('\n')}`
    );
  }

  if (errors.length > 0) {
    console.warn(
      `[searchIdea] ${errors.length}/${allPromises.length} searches failed, continuing with ${allResults.length} results`
    );
  }

  console.log(`[searchIdea] Total results collected: ${allResults.length}`);

  return { searchResults: allResults };
}
