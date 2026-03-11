# Lesson: Sentinel strings are truthy — filter them explicitly

## Problem
`generateOutreach` filtered targets needing draft generation with:
```ts
const targets = state.ideaTargets.filter(t => t.status === 'approved' && !t.outreachDraft);
```

If a previous attempt failed, the target had `outreachDraft: '[Draft generation failed]'`. This is truthy, so `!t.outreachDraft` was `false`, and the target was permanently skipped — it could never be re-generated.

## Fix
Added explicit sentinel check:
```ts
const targets = state.ideaTargets.filter(
  (t) => t.status === 'approved' &&
    (!t.outreachDraft || t.outreachDraft === '[Draft generation failed]')
);
```

## Rule
When using sentinel strings to mark failures (e.g., `'[Draft generation failed]'`, `'ERROR'`, `'N/A'`), always account for them in boolean filtering. A sentinel is truthy — `!sentinel` is false. Either:
1. Check for the sentinel explicitly (as above)
2. Use `null` instead of a string sentinel (then `!null` works correctly)

Option 2 is generally better for new code. We kept the sentinel here for logging clarity.

## Related
- `.agent/SOP/agent-architecture-patterns.md` — Node function patterns
