# Distribution Agent

LangGraph TypeScript agent — discovers relevant conversations on social platforms, evaluates fit, generates reply drafts, and posts after user approval. Dual-mode: business outreach + idea validation.

## Stack
- Runtime: Node.js >=20, TypeScript 5 ESM (all imports need .js extension)
- Framework: LangGraph (@langchain/langgraph), LLM: Claude Sonnet via @langchain/anthropic
- State: Zod v4 with registry reducers, SqliteSaver checkpointer
- Search: Python subprocess (last30days.py), Reddit (public .json), X (optional bearer token)
- Package manager: pnpm (not npm, not yarn)

## Commands
- Dev (LangGraph Studio): `pnpm dev`
- Typecheck: `pnpm typecheck`
- Run directly: `tsx --env-file=.env src/test-run.ts`

## Architecture (23 nodes, dual-mode graph)
- Entry: getInput → mode selector → business path (9 nodes) OR idea path (12 nodes)
- State: src/state.ts | Graph: src/index.ts | Prompts: src/lib/prompts.ts | Config: src/config.ts

@.agent/System/architecture.md

## Key References
- Full project index: see README.md
- Past debugging lessons: see .agent/Lessons/ (read when debugging similar issues)
- LangGraph patterns: see .agent/SOP/ (read when working on graph structure)

## Workflow
- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- Write plans to `.agent/tasks/` with checkable items, check in before implementing
- Use subagents liberally — one task per subagent, keep main context clean
- Capture lessons: update `.agent/Lessons/` after corrections

## Verification (IMPORTANT — never skip, even for trivial changes)
After ANY code change, before marking done:
1. Run `/simplify` on changed code
2. Run tests: `tsx --env-file=.env src/test-run.ts`
3. If issues → fix → go back to step 1
4. Repeat until: "Would a staff engineer approve this?"
5. Run `/update-docs` if changes affect behavior, architecture, or APIs
When writing implementation plans, the LAST section MUST be a Verification checklist.

## Boundaries
GREEN (do without asking): fix lint/types/tests, single-file bug fixes, formatting, reading files
YELLOW (propose first): multi-file changes, new features, schema changes, prompt changes
RED (always ask): deleting files, rewriting working code, env config, git push/merge, security changes

## When compacting
Preserve: list of modified files, test results, current plan status, architectural decisions made this session.
