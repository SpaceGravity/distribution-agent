## Workflow Orchestration

### 1. Plan Node Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately – don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One tack per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update .agent/lessons/ with the pattern, related lessons on unique .md files do not put everything on one file.
- Write rules for yourself that prevent the same mistake and add then to .agent/lessons
- Ruthlessly iterate on these lessons until mistake rate drops
- Review lessons at session start for relevant project

### 4. Verification Before Done

- After writing any code and before testing it use /simplify command on what you have implmeneted
- Never mark a task complete without proving it works in all aspects (UI,backend frontend, etc..)
- After running /simplify, if issues are found during testing, fix them then re-run /simplify. Repeat this loop until the code is proven to work correctly under all aspects.
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes – don't over-engineer
- Always challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests – then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how


## Task Management

- Plan First: Write plan to .agent/tasks/ with checkable items, each plan in unique .md
- Verify Plan: Check in before starting implementation
- Track Progress: Mark items complete as you go
- Explain Changes: High-level summary at each step
- Document Results: Use /update-docs for documnetation
- Capture Lessons: Update .agent/lessons after corrections


## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.
- Security matters; always ask yourself: "Is what I built robustly secured?"
- At each session launch sub-agent to review README.md file to have comprehensive understanding for the project, and review