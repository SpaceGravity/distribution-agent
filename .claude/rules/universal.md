# Universal Rules

- All imports require .js extension (ESM)
- No new npm dependencies — use built-in fetch, manual CSV (RFC 4180)
- Numeric state fields: always use ?? 0 (checkpointer drops defaults on deserialize)
- Sentinel strings like '[Draft failed]' are truthy — filter explicitly with dedicated checks
- Prompt functions MUST accept ALL parameters their callers pass — missing = silent data loss
- Nodes declared with { ends } MUST return Command, never Partial<State> — graph silently halts
- All prompts live in src/lib/prompts.ts (pure functions, no LLM calls)
- Always pass { ...process.env } to child_process spawn/exec — restricted env strips API keys
