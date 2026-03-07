// generateReplies node — Generates reply drafts for the top N search results
// Uses Claude with tone examples as few-shot, batched with concurrency limit

import type { DistributionState } from '../state.js';
import type { SearchResultItem, ReplyDraft } from '../state.js';
import { llm } from '../lib/llm.js';
import { replyGenerationPrompt } from '../lib/prompts.js';
import { CONFIG } from '../config.js';

export async function generateReplies(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  if (!state.businessUnderstanding) {
    throw new Error('Business understanding not available in state.');
  }

  // Use LLM-approved targets if available, otherwise fall back to top results by score
  const targetCount = state.targetCount ?? CONFIG.DEFAULT_TARGET_COUNT;
  const pool =
    state.approvedTargets.length > 0
      ? state.approvedTargets
      : state.searchResults;
  const targets = [...pool]
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount);

  console.log(
    `[generateReplies] Generating replies for ${targets.length} targets`
  );

  // Generate replies in batches with concurrency limit
  const drafts: ReplyDraft[] = [];
  const batchSize = CONFIG.REPLY_CONCURRENCY_LIMIT;

  for (let i = 0; i < targets.length; i += batchSize) {
    const batch = targets.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(
      batch.map((target) => generateSingleReply(target, state))
    );

    for (let j = 0; j < batchResults.length; j++) {
      const result = batchResults[j];
      const target = batch[j];

      if (result.status === 'fulfilled') {
        drafts.push(result.value);
      } else {
        console.warn(
          `[generateReplies] Failed to generate reply for ${target.url}: ${result.reason}`
        );
        // Create a placeholder draft marked as skipped
        drafts.push({
          targetId: target.id,
          targetPlatform: target.platform,
          targetUrl: target.url,
          targetTitle: target.title,
          targetText: target.text,
          draft: '[Failed to generate reply]',
          status: 'skipped',
        });
      }
    }

    console.log(
      `[generateReplies] Batch ${Math.floor(i / batchSize) + 1}: ${batch.length} replies generated`
    );
  }

  return {
    approvedTargets: targets,
    replyDrafts: drafts,
    currentReviewIndex: 0,
  };
}

// Generate a single reply draft for one target
async function generateSingleReply(
  target: SearchResultItem,
  state: DistributionState
): Promise<ReplyDraft> {
  const prompt = replyGenerationPrompt(
    target,
    state.businessUnderstanding!,
    state.toneExamples
  );

  const response = await llm.invoke(prompt);
  const draft =
    typeof response.content === 'string'
      ? response.content
      : String(response.content);

  return {
    targetId: target.id,
    targetPlatform: target.platform,
    targetUrl: target.url,
    targetTitle: target.title,
    targetText: target.text.substring(0, 500),
    draft: draft.trim(),
    status: 'pending',
  };
}
