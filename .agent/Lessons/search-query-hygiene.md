# Lesson: Search Query Hygiene for last30days.py

## Problem
LLM-generated search queries included `site:reddit.com OR site:x.com` operators.
The last30days.py script already handles platform routing via `--search=reddit,x`,
so `site:` operators in the query text itself are passed verbatim to Reddit's search API.
Reddit search is NOT Google — it treats `site:reddit.com` as literal text to match,
returning 0 results every time.

## Root Cause
The `ideaCriteriaPrompt` didn't tell the LLM that platform filtering is handled
separately. The LLM assumed it needed Google-style `site:` operators.

## Fix (5 changes)
1. **Prompt-level**: Added CRITICAL QUERY RULES to both `ideaCriteriaPrompt` and
   `criteriaGenerationPrompt` — no `site:` operators, keep queries under 8 words,
   no boolean operators, plain natural language only.
2. **Code-level sanitizer**: Added `sanitizeQuery()` in `search-runner.ts` to strip
   `site:` patterns as a defense-in-depth safety net.
3. **Quick depth**: Forced `--quick` in `search-idea.ts` — `default` depth enriches
   top posts with comments, which takes 90s+ and triggers the script's global timeout,
   discarding ALL results even when Reddit found 80-120 posts.
4. **Per-platform isolation**: Split `--search=reddit,x` into separate calls per
   platform in `search-idea.ts`. X's 60s timeout was triggering the global 90s kill,
   discarding Reddit's successful results. Now X fails independently.
5. **Escape hatch**: `askIdeaHelp` now detects "proceed" intent and routes to
   `batchReviewTargets` instead of always looping back to `refineIdeaSearch`.

## Key Takeaways
1. When an LLM generates inputs for an external tool, the prompt MUST document:
   - What the tool handles automatically (don't duplicate it in the query)
   - Input format constraints (length, syntax)
   - What NOT to include (negative instructions are critical for LLMs)
2. Add code-level sanitization as a fallback — prompts are suggestions, not guarantees.
3. Never combine multiple unreliable external calls in one subprocess — if one
   times out, it kills results from the others. Isolate per-platform.
4. Skip enrichment steps unless strictly needed — they're the #1 timeout source.
