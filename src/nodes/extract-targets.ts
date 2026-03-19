// extractTargets node — LLM processes search results to extract people and communities
// Extracts authors as person targets and communities (subreddits, forums) as hub targets

import z from 'zod';
import { createHash } from 'node:crypto';
import type {
  DistributionState,
  IdeaTarget,
  SearchResultItem,
} from '../state.js';
import { llm } from '../lib/llm.js';
import { extractTargetsPrompt } from '../lib/prompts.js';
import { CONFIG } from '../config.js';

const ExtractedTargetSchema = z.object({
  name: z.string(),
  platform: z.string(),
  url: z.string(),
  category: z.enum([
    'potential_customer',
    'domain_expert',
    'community_hub',
    'competitor_user',
  ]),
  whyRelevant: z.string(),
  sourcePostUrl: z.string(),
  sourcePostTitle: z.string(),
});

const ExtractionOutputSchema = z.object({
  targets: z.array(ExtractedTargetSchema),
});

function generateTargetId(platform: string, name: string): string {
  return createHash('sha256')
    .update(`${platform}:${name.toLowerCase()}`)
    .digest('hex')
    .slice(0, 12);
}

export async function extractTargets(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.ideaUnderstanding) {
    throw new Error('Idea understanding not available in state.');
  }

  if (state.searchResults.length === 0) {
    console.warn('[extractTargets] No search results to extract from.');
    return {};
  }

  // Platform-diverse selection: guarantee each platform a fair share of slots
  const maxResults = CONFIG.IDEA_TARGET_CAP;
  const allSorted = [...state.searchResults].sort(
    (a, b) => b.score - a.score
  );

  const byPlatform = new Map<string, SearchResultItem[]>();
  for (const r of allSorted) {
    let arr = byPlatform.get(r.platform);
    if (!arr) {
      arr = [];
      byPlatform.set(r.platform, arr);
    }
    arr.push(r);
  }

  const platformCount = byPlatform.size;
  if (platformCount === 0) {
    console.warn('[extractTargets] No platforms found in search results.');
    return {};
  }

  const minPerPlatform = Math.max(
    3,
    Math.floor(maxResults / platformCount)
  );

  const selectedIds = new Set<string>();
  const topResults: SearchResultItem[] = [];

  // Phase 1: guaranteed slots per platform (top-scored within each)
  for (const [, items] of byPlatform) {
    const limit = Math.min(items.length, minPerPlatform);
    for (let i = 0; i < limit; i++) {
      const item = items[i];
      if (!selectedIds.has(item.id)) {
        selectedIds.add(item.id);
        topResults.push(item);
      }
    }
  }

  // Phase 2: fill remaining slots from global ranked list
  for (const item of allSorted) {
    if (topResults.length >= maxResults) break;
    if (!selectedIds.has(item.id)) {
      selectedIds.add(item.id);
      topResults.push(item);
    }
  }

  const structuredLlm = llm.withStructuredOutput(ExtractionOutputSchema);
  const prompt = extractTargetsPrompt(topResults, state.ideaUnderstanding);
  const extraction = await structuredLlm.invoke(prompt);

  // Deduplicate by platform + normalized name and assign IDs
  const seen = new Set<string>();
  const ideaTargets: IdeaTarget[] = [];

  for (const t of extraction.targets) {
    const key = `${t.platform}:${t.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    ideaTargets.push({
      id: generateTargetId(t.platform, t.name),
      name: t.name,
      platform: t.platform,
      url: t.url,
      category: t.category,
      whyRelevant: t.whyRelevant,
      followerCount: null,
      sourcePostUrl: t.sourcePostUrl,
      sourcePostTitle: t.sourcePostTitle,
      outreachDraft: '',
      outreachType: 'dm',
      status: 'pending',
      rejectionReason: null,
    });

    if (ideaTargets.length >= CONFIG.IDEA_TARGET_CAP) break;
  }

  console.log(
    `[extractTargets] Extracted ${ideaTargets.length} unique targets from ${topResults.length} results`
  );

  return { ideaTargets };
}
