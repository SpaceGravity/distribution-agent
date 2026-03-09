# Distribution Agent

LangGraph-based product outreach automation agent. Understands your business, searches for relevant conversations, generates contextual replies, and manages outreach campaigns.

## Architecture

- **11 nodes** with Command-based routing
- **SqliteSaver** checkpointer for persistence
- **Human-in-the-loop** interrupts for review and approval
- **Target rejection feedback** — reject unsuitable targets with reasons that refine future searches

## Setup

```bash
pnpm install
cp .env.example .env  # Add your API keys
```

## Usage

```bash
# Run basic test
pnpm test

# Run full test suite
pnpm test:advanced

# Launch LangGraph Studio
pnpm dev

# Type check
pnpm typecheck
```

## Review Actions

During reply review, you have 5 options:

| Action | What it does |
|--------|-------------|
| **approve** | Post the reply |
| **edit** | Provide edited text, then post |
| **reject_reply** | Regenerate with feedback (same target) |
| **reject_target** | Skip target entirely + record why (influences future searches) |
| **skip** | Move to next without posting |

### Target Rejection Feedback Loop

When you `reject_target` with a reason (e.g., "this post is about personal finance, not cloud costs"), that feedback is:
1. Recorded in state as a `TargetRejectionNote`
2. Injected into search criteria generation prompts to avoid similar content
3. Injected into evaluation prompts to exclude similar posts
4. Persisted in the strategy record for cross-session learning

## Project Structure

```
src/              # Agent source code
  index.ts        # Graph definition and entry point
  state.ts        # State schema (including TargetRejectionNote)
  config.ts       # Configuration
  nodes/          # All graph nodes (11 files)
  lib/            # Shared utilities (LLM, prompts, search)
  templates/      # Prompt templates
docs/             # Documentation, SOPs, and specs
  SOP/            # Standard operating procedures (8 files)
  The_agent_specs.md  # Full requirements spec
```

## Graph Flow

```
START -> getInput -> understandBusiness -> generateCriteria -> search -> evaluate
                                                               ^           |
                                                               |    [satisfactory?]
                                                               |     /     |       \
                                                               |   yes   no(<5)   no(>=5)
                                                               |   /       |         \
                                                      generateReplies  refineSearch  askUserHelp
                                                               |
                                                         reviewReply (one-by-one)
                                                               |
                                                          postReply
                                                               |
                                                          saveMemory -> END
```

## Documentation Index

| File | Description |
|------|-------------|
| `.agent/README.md` | This file — project overview and documentation index |
| `.agent/System/architecture.md` | Full system docs: tech stack, project structure, integrations, config, persistence |
| `.agent/SOP/agent-architecture-patterns.md` | Graph design, node signatures, file organization, evaluation filtering |
| `.agent/SOP/langgraph-command-routing.md` | Static vs dynamic edges, Command pattern, self-loops |
| `.agent/SOP/langgraph-interrupts-and-resume.md` | `interrupt()`, resume, SQLite persistence, sequential review |
| `.agent/SOP/langgraph-state-and-reducers.md` | State schemas, reducer patterns, defaults gotchas |
| `.agent/SOP/llm-structured-output-and-prompts.md` | `withStructuredOutput`, prompt templates, rejection context |
| `.agent/SOP/subprocess-and-search.md` | Python subprocess, last30days integration, query capping |
| `.agent/SOP/testing-and-debugging.md` | Test patterns, common bugs, debugging tips |
| `.agent/SOP/typescript-esm-and-tooling.md` | ESM imports, pnpm, tsx, ESLint, LangGraph Studio |
| `.agent/Tasks/implementation-plan.md` | Full 16-task implementation roadmap (all complete) |
| `.agent/Lessons/` | Lessons learned from corrections (populated as they occur) |

### Related Documentation

- `CLAUDE.md` — Claude Code instructions and workflow rules
- `docs/The_agent_specs.md` — Full requirements specification
- `docs/tone_examples.md` — Platform-specific tone and reply examples
- `docs/business.md` — Sample business description
