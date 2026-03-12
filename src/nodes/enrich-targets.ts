// enrichTargets node — Enriches idea targets with follower/subscriber counts
// Reddit: subreddit subscriber count, X: follower count, others: null

import type { DistributionState, IdeaTarget } from '../state.js';
import { CONFIG } from '../config.js';
import {
  getSubredditMemberCount,
  getTwitterFollowerCount,
  verifyUrl,
} from '../lib/enrichment.js';

export async function enrichTargets(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  const targets = state.ideaTargets;
  if (targets.length === 0) {
    console.warn('[enrichTargets] No targets to enrich.');
    return {};
  }

  const hasXKey = !!CONFIG.X_BEARER_TOKEN;
  if (!hasXKey) {
    console.warn(
      '[enrichTargets] X_BEARER_TOKEN not set — skipping X enrichment'
    );
  }

  console.log(
    `[enrichTargets] Enriching ${targets.length} targets (concurrency: ${CONFIG.ENRICHMENT_CONCURRENCY})`
  );

  // Process targets in batches with concurrency limit
  const enriched: IdeaTarget[] = [];
  for (
    let i = 0;
    i < targets.length;
    i += CONFIG.ENRICHMENT_CONCURRENCY
  ) {
    const batch = targets.slice(i, i + CONFIG.ENRICHMENT_CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map((target) => enrichSingle(target, hasXKey))
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        enriched.push(result.value);
      } else {
        console.warn(
          `[enrichTargets] Failed to enrich ${batch[j].name}: ${result.reason}`
        );
        enriched.push({ ...batch[j], followerCount: null });
      }
    }
  }

  console.log(
    `[enrichTargets] Enrichment complete. ${enriched.filter((t) => t.followerCount !== null).length}/${enriched.length} targets have follower data`
  );

  return { ideaTargets: enriched };
}

async function enrichSingle(
  target: IdeaTarget,
  hasXKey: boolean
): Promise<IdeaTarget> {
  // Run follower lookup and URL verification in parallel
  const followerPromise = getFollowerCount(target, hasXKey);
  const urlPromise =
    target.category === 'community_hub' && target.url
      ? verifyUrl(target.url)
      : Promise.resolve(true);

  const [followerCount, isAlive] = await Promise.all([
    followerPromise,
    urlPromise,
  ]);

  if (!isAlive) {
    console.warn(
      `[enrichTargets] Dead URL for community ${target.name}: ${target.url}`
    );
  }

  return { ...target, followerCount };
}

async function getFollowerCount(
  target: IdeaTarget,
  hasXKey: boolean
): Promise<number | null> {
  if (target.platform === 'reddit') {
    const subreddit = extractSubredditName(target.name, target.url);
    if (subreddit) {
      return getSubredditMemberCount(subreddit);
    }
  } else if (target.platform === 'x' && hasXKey) {
    const username = extractXUsername(target.name, target.url);
    if (username) {
      return getTwitterFollowerCount(username, CONFIG.X_BEARER_TOKEN);
    }
  }
  return null;
}

function extractSubredditName(name: string, url: string): string | null {
  // Try URL first: /r/subredditname
  const urlMatch = url.match(/\/r\/([^/?\s]+)/);
  if (urlMatch) return urlMatch[1];
  // Fallback: name might be "r/subredditname" or just the name
  const nameMatch = name.match(/^r\/(.+)$/i);
  if (nameMatch) return nameMatch[1];
  // Validate raw name matches subreddit format before using it
  if (/^[a-zA-Z0-9_]+$/.test(name)) return name;
  return null;
}

function extractXUsername(name: string, url: string): string | null {
  // Try URL: twitter.com/username or x.com/username
  const urlMatch = url.match(/(?:twitter\.com|x\.com)\/([^/?\s]+)/);
  if (urlMatch) return urlMatch[1];
  // Fallback: name might be "@username" or just username
  const cleaned = name.replace(/^@/, '');
  // Validate username format before using
  if (/^[a-zA-Z0-9_]+$/.test(cleaned)) return cleaned;
  return null;
}
