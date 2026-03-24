# LLM Call Resilience + Upsert Reducer Safety

## Problem
`withStructuredOutput().invoke()` can throw a TypeError with empty message when
the LLM returns unparseable output or the API fails. Without try-catch, this
surfaces as `{"message":"","terminated":true,"name":"TypeError"}` in LangGraph
Studio — impossible to debug.

## Rules

1. **Always use `safeStructuredInvoke(schema, prompt, nodeName)`** from `src/lib/llm.ts`
   instead of bare `llm.withStructuredOutput(schema).invoke(prompt)`. The helper
   catches errors, logs diagnostics (error type, message, prompt length), and
   re-throws with a descriptive message.

2. **Never filter-remove entries from a state field with an upsert reducer.**
   The upsert reducer merges `left` (existing state) with `right` (new update).
   If you filter out entries in `right`, the originals from `left` survive —
   "zombie" entries that can't be removed.

   BAD:  `const updated = state.items.filter(t => !rejectedIds.has(t.id))`
   GOOD: `const updated = state.items.map(t => rejectedIds.has(t.id) ? {...t, status: 'rejected'} : t)`

## Affected files
- `src/lib/llm.ts` — `safeStructuredInvoke` helper
- All nodes with LLM calls — migrated to use the helper
- `src/nodes/batch-review-targets.ts` — marks rejected instead of filtering
