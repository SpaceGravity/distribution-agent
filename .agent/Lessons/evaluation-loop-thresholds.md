# Lesson: Evaluation prompts need concrete thresholds, not vague strictness

## Problem
The `evaluateIdeaTargetsPrompt` told the LLM to "Be strict: only approve targets that genuinely match." With no concrete threshold, the LLM kept rejecting everything → NOT SATISFACTORY → loop → refine → search → same result → loop again until MAX_ITERATIONS.

## Root cause
Vague instructions like "be strict" let the LLM's own judgment dominate. Different runs gave wildly different satisfaction thresholds. Combined with partial search failures (X timeouts), fewer results made the evaluator even pickier.

## Fix
Replace vague instructions with concrete, actionable thresholds:
```
Decision guidelines:
- Mark satisfactory=true if there are at least 3 approved targets with reasonable audience match.
- Approve any target that is plausibly relevant — perfection is not required for validation outreach.
- Only reject targets that are clearly irrelevant (wrong domain, spam, unrelated topic).
- Prefer approving borderline targets over looping for more searches.
```

## Lesson
- Always give LLM evaluators concrete pass/fail thresholds (e.g., "≥3 approved targets").
- For validation/outreach use cases, bias toward action over perfection.
- When search infrastructure is degraded, strict evaluation + retry loops = wasted API calls with no improvement.
- Consider the full loop cost: each "NOT SATISFACTORY" triggers refine → search → extract → enrich → evaluate again.

## Related
- `.agent/SOP/llm-structured-output-and-prompts.md` — Prompt design patterns
- `.agent/Lessons/prompt-parameter-alignment.md` — Prompt function signatures
