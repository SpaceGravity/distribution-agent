## Session Start

1. Launch a sub-agent to review `README.md` for project indexing, then use that index to review files related to the given task.
2. Review `.agent/Lessons/` for lessons relevant to the task — avoid repeating past mistakes.
3. Run `git status` to confirm clean state and correct branch.

## Planning

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions).
- Write detailed specs upfront to reduce ambiguity.
- If something goes sideways, STOP and re-plan immediately — don't keep pushing.
- Write plan to `.agent/tasks/` with checkable items, each plan in a unique `.md`.
- Check in with user before starting implementation.

## Subagent Strategy

- Use subagents liberally to keep main context window clean.
- Offload research, exploration, and parallel analysis to subagents.
- For complex problems, throw more compute at it via subagents.
- One task per subagent for focused execution.

## Verification Loop

After writing any code, follow this loop before marking done:

1. Run `/simplify` on the implemented code.
2. Test it — run tests, check logs, verify all aspects (UI, backend, frontend).
3. If issues found, fix them and go back to step 1.
4. Repeat until the code is proven correct under all aspects.
5. Ask yourself: "Would a staff engineer approve this?"

## Task Tracking

- Track progress: mark plan items complete as you go.
- Explain changes: high-level summary at each step.
- Document results: use `/update-docs` for documentation.
- Capture lessons: update `.agent/Lessons/` after corrections.

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.
- **Security**: Always ask yourself — "Is what I built robustly secured?"
