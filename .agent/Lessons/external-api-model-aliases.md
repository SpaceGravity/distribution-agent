# Lesson: External API model IDs can change without notice

## Problem
X/Twitter search via `last30days.py` was returning 0 results. The xAI Responses API rejected calls silently because the model alias `grok-4-1-fast` had been renamed to `grok-4-1-fast-non-reasoning`. The `XAI_ALIASES` dict in `~/.claude/skills/last30days/scripts/lib/models.py` still referenced the old name.

## Symptoms
- `searchIdea` returned 0 results for X platform
- No obvious error — the API rejection was not surfaced clearly
- Reddit searches worked fine (different provider)

## Fix
1. Updated `XAI_ALIASES` in `models.py` (line 16-17) to use `grok-4-1-fast-non-reasoning`.
2. Cleared the cached model selection at `~/.cache/last30days/model_selection.json`.

## Diagnosis Technique
Query the provider's model list endpoint directly:
```bash
curl -s https://api.x.ai/v1/models -H "Authorization: Bearer $XAI_API_KEY" | jq '.data[].id'
```
Compare the response against the aliases in `models.py`.

## Key Takeaways
1. External API model IDs are not stable — providers rename or retire them without notice.
2. When a platform search returns 0 results unexpectedly, check the model alias first. The symptom (0 results) does not point obviously at the cause (wrong model name).
3. Always verify model names against the provider's `/v1/models` endpoint rather than assuming documentation or cached values are current.
4. After updating a model alias, clear the model cache (`~/.cache/last30days/model_selection.json`) so the new name is picked up immediately.

## Related
- `~/.claude/skills/last30days/scripts/lib/models.py` — Model alias definitions
- `.agent/Lessons/search-query-hygiene.md` — Other causes of 0-result searches
