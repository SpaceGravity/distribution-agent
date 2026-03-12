# Lesson: API enrichment must be resilient — degrade gracefully at every level

## Problem
The idea path enriches targets with follower/subscriber counts from Reddit and X APIs. Any of these can fail (rate limits, invalid usernames, network issues, or missing API keys for X). If any failure blocks the pipeline, the user loses all their discovered targets.

## Pattern: Use zero-auth endpoints where possible, soft-warn on missing config

### 1. Reddit — public `.json` endpoint (no API keys needed)
```ts
export async function getSubredditMemberCount(subreddit: string): Promise<number | null> {
  const response = await fetch(
    `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/about.json`,
    {
      headers: { 'User-Agent': 'distribution-agent/1.0' },
      signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),
    }
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.data?.subscribers ?? null;
}
```
Reddit's public `about.json` endpoint returns subscriber counts without OAuth. This eliminated the need for `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET` entirely.

### 2. Missing API keys → warn and skip (never throw)
```ts
const hasXKey = !!CONFIG.X_BEARER_TOKEN;
if (!hasXKey) {
  console.warn('[enrichTargets] X_BEARER_TOKEN not set — skipping X enrichment');
}
```
Enrichment is a nice-to-have — targets still have value without follower counts.

### 3. Individual enrichment failures → log warning, set null, continue
```ts
const results = await Promise.allSettled(
  batch.map((target) => enrichSingle(target, hasXKey))
);

for (let j = 0; j < results.length; j++) {
  if (results[j].status === 'fulfilled') {
    enriched.push(results[j].value);
  } else {
    console.warn(`Failed to enrich ${batch[j].name}: ${results[j].reason}`);
    enriched.push({ ...batch[j], followerCount: null });  // null, not error
  }
}
```

### 4. Use `AbortSignal.timeout()` for built-in fetch calls
```ts
const response = await fetch(url, {
  signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),  // 10s
});
```

## Lesson
- Prefer zero-auth public endpoints over OAuth when the data is publicly available.
- The pipeline should never fail because of missing API keys, invalid subreddits, or bad usernames.
- Enrichment is optional — the core value (target discovery) must always complete.
- Soft-warn at config level, fail soft at individual level.
- Only throw if the data is truly essential (e.g., missing `ANTHROPIC_API_KEY` for LLM calls).

## Related
- `.agent/SOP/agent-architecture-patterns.md` — External API enrichment pattern
