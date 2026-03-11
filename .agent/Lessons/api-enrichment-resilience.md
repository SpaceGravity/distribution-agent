# Lesson: API enrichment must be resilient — degrade gracefully at every level

## Problem
The idea path enriches targets with follower/subscriber counts from Reddit and X APIs. Any of these can fail (rate limits, invalid usernames, network issues, or simply missing API keys). If any failure blocks the pipeline, the user loses all their discovered targets.

## Pattern: Soft-warn on missing config, fail soft on individual calls

### 1. Missing API keys → warn and skip (never throw)
```ts
const hasRedditKeys = !!CONFIG.REDDIT_CLIENT_ID && !!CONFIG.REDDIT_CLIENT_SECRET;
const hasXKey = !!CONFIG.X_BEARER_TOKEN;
if (!hasRedditKeys) {
  console.warn('[enrichTargets] REDDIT_CLIENT_ID/REDDIT_CLIENT_SECRET not set — skipping Reddit enrichment');
}
if (!hasXKey) {
  console.warn('[enrichTargets] X_BEARER_TOKEN not set — skipping X enrichment');
}
```
Enrichment is a nice-to-have — targets still have value without follower counts. Pass the `hasRedditKeys`/`hasXKey` flags through to `enrichSingle()` so it skips API calls for missing platforms.

### 2. Individual enrichment failures → log warning, set null, continue
```ts
const results = await Promise.allSettled(
  batch.map((target) => enrichSingle(target, redditToken))
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

### 3. Use `AbortSignal.timeout()` for built-in fetch calls
```ts
const response = await fetch(url, {
  signal: AbortSignal.timeout(CONFIG.ENRICHMENT_TIMEOUT_MS),  // 10s
});
```

## Lesson
The pipeline should never fail because of missing API keys, invalid subreddits, or bad usernames. Enrichment is optional — the core value (target discovery) must always complete. Soft-warn at config level, fail soft at individual level. Only throw if the data is truly essential (e.g., missing `ANTHROPIC_API_KEY` for LLM calls).

## Related
- `.agent/SOP/agent-architecture-patterns.md` — External API enrichment pattern
