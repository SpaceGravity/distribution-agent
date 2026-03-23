# Lesson: xAI /v1/responses endpoint may hang — X search requires plan verification

## Problem
The `last30days.py` script uses xAI's `/v1/responses` endpoint with `x_search` tool to search X/Twitter. This endpoint hangs indefinitely (no response, no error) on some API plans/keys, causing every X search to time out.

## Diagnosis steps
1. `/v1/chat/completions` → works (200 OK, "Hello from Grok") — confirms key is valid
2. `/v1/responses` without tools → hangs (no response)
3. `/v1/responses` with `x_search` → hangs (no response)
4. `/v1/chat/completions` with `search_parameters` → returns `410 Gone: "Live search is deprecated. Please switch to the Agent Tools API"`

This confirms the key works for chat but the Agent Tools API (`/v1/responses`) is not available on the current plan.

## Impact on the agent
- X searches always time out after 30-90s (depending on `--quick`/`--deep`)
- The `last30days.py` script exits with error when X times out AND Reddit finishes (the timeout kills the process)
- Some searches that include both reddit+x fail entirely even though Reddit returned results

## Workaround
- Use only `reddit` in `selectedPlatforms` for idea mode — Reddit search works reliably via ScrapeCreators API
- The agent gracefully degrades: X timeout doesn't block the pipeline, just wastes time
- If X search is needed, verify the xAI plan supports the `/v1/responses` endpoint

## Related
- `.agent/Lessons/subprocess-env-passthrough.md` — Env var passthrough for subprocess
- `.agent/SOP/subprocess-and-search.md` — Search integration patterns
- `.agent/Lessons/api-enrichment-resilience.md` — Graceful degradation pattern
