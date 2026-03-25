---
paths:
  - "src/lib/prompts.ts"
---
# Prompt Rules

- 9 prompt functions total — check existing before adding new ones
- Evaluation thresholds must be concrete (>=3 approved targets), not vague ("be strict")
- All prompts are pure functions — no LLM calls, no side effects
