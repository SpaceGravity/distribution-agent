# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Distribution Agent is a standalone LangGraph-based agent that automates product distribution outreach. It reads a business description (.md file), identifies potential customers on platforms (X/Twitter, Reddit, YouTube, TikTok, Instagram, Hacker News, websites), evaluates search results through an iterative refinement loop (up to 5 iterations), generates human-sounding reply drafts, and stages them for one-by-one review before posting.

See `The_agent_specs.md` for full requirements, `SOP/` for operational procedures.

## Commands

```bash
# Install dependencies
pnpm install

# Launch LangGraph Studio (dev server)
pnpm dev

# Type check
pnpm typecheck

# Lint
pnpm lint

# Format
pnpm format

# Run basic integration test (requires .env with ANTHROPIC_API_KEY)
pnpm test

# Run advanced test (reject-regenerate, SQLite resume, iteration counter)
pnpm test:advanced

# Clean SQLite before fresh test run
rm -f distribution-agent.sqlite
```

## Architecture

### Source code layout
```
src/
  index.ts                # Graph construction + compile + export `graph`
  state.ts                # All Zod state schemas + TS types (reducers for arrays)
  config.ts               # Config constants from env
  nodes/                  # One file per node function (11 nodes)
    get-input.ts          # Collect user input (interrupt) or use pre-populated state
    understand-business.ts # Read .md file, LLM structured understanding
    generate-criteria.ts  # LLM generates search keywords/queries
    search.ts             # Call last30days via subprocess (capped to 5 queries)
    evaluate.ts           # LLM evaluates product-market fit, filters relevant results
    refine-search.ts      # LLM refines criteria from evaluation history
    ask-user-help.ts      # Interrupt after 5 failed iterations
    generate-replies.ts   # LLM generates reply drafts (batch, concurrency 5)
    review-reply.ts       # Interrupt per draft: approve/edit/reject_reply/reject_target/skip
    post-reply.ts         # Clipboard+link output (auto-post behind config flag)
    save-memory.ts        # Persist winning strategy to ~/.distribution-agent/
  lib/
    llm.ts                # Shared ChatAnthropic instance
    search-runner.ts      # child_process wrapper for last30days.py
    prompts.ts            # All prompt templates (5 functions + rejection context injection)
  templates/
    business-description.md  # Template for users
  test-run.ts             # Basic E2E test (auto-approve all)
  test-advanced.ts        # Advanced test (reject, resume, assertions)
docs/
  The_agent_specs.md      # Full requirements spec
  business.md             # Sample business description
  tone_examples.md        # Sample tone examples
  SOP/                    # Standard operating procedures (8 files)
```

### Graph flow
```
START -> getInput -> understandBusiness -> generateCriteria -> search -> evaluate
                                                               ^           |
                                                               |    [satisfactory?]
                                                               |     /     |       \
                                                               |   yes   no(<5)   no(>=5)
                                                               |   /       |         \
                                                      generateReplies  refineSearch  askUserHelp
                                                               |          |              |
                                                               v          +---> search   |
                                                         reviewReply <--+           +----+
                                                      /    |    |    \   |
                                                approve  edit  reject  reject_target
                                                     \    |    |          |
                                                    postReply  |    skip+record note
                                                          |    +-> reviewReply (same index, regenerated)
                                                    [next or done]
                                                          |
                                                     saveMemory -> END
```

### Review actions (reviewReply node)
| Action | Input format | Behavior |
|--------|-------------|----------|
| `approve` | `"approve"` or `{ action: "approve" }` | Mark approved, route to postReply |
| `edit` | `"edit: new text"` or `{ action: "edit", editedReply: "..." }` | Save edited text, route to postReply |
| `reject_reply` | `"reject_reply: feedback"` or `{ action: "reject_reply", feedback: "..." }` | Regenerate draft with feedback, re-review same index |
| `reject_target` | `"reject_target: reason"` or `{ action: "reject_target", reason: "..." }` | Skip target, record rejection note for future search refinement |
| `skip` | `"skip"` or `{ action: "skip" }` | Mark skipped, advance to next draft |

Backward compatible: bare `reject` and `reject:feedback` still work as `reject_reply`.

### Target rejection feedback loop
When a user sends `reject_target`, the rejection note (platform, title, reason) is:
1. Stored in `state.targetRejectionNotes` (append reducer)
2. Injected into `criteriaGenerationPrompt()` as `<target_rejection_history>` XML block
3. Injected into `evaluationPrompt()` as `<rejected_targets>` XML block
4. Persisted in `save-memory.ts` as `targetRejectionPatterns` in the strategy record

This creates a feedback loop: rejected targets influence future search criteria and evaluation filtering.

### Key patterns
- **State**: Zod schemas with `register(registry, { reducer })` for arrays (dedup, append, upsert)
- **Routing**: `Command` objects with `{ ends: [...] }` for conditional transitions
- **Human-in-the-loop**: `interrupt()` + `Command({ resume })` for user interaction
- **Checkpointer**: SqliteSaver for persistent state across restarts
- **Structured output**: `llm.withStructuredOutput(ZodSchema)` for typed LLM responses
- **Rejection context**: Target rejection notes injected into prompts via XML blocks

### State schemas (src/state.ts)
| Schema | Reducer | Purpose |
|--------|---------|---------|
| `searchResults` | Dedup by ID, keep highest score | Accumulated search results |
| `evaluationHistory` | Append | Track iteration decisions |
| `targetRejectionNotes` | Append | User feedback on unsuitable targets |
| `replyDrafts` | Upsert by targetId | Draft updates replace previous |
| `postedReplies` | Append | Record of posted replies |

## Technical stack
- **Runtime**: Node.js 20+, ESM modules (`"type": "module"`)
- **TypeScript**: Strict mode, ESNext target. All imports use `.js` extension.
- **Package manager**: pnpm (v10+)
- **Dependencies**: `@langchain/langgraph`, `@langchain/anthropic`, `@langchain/langgraph-checkpoint-sqlite`, `zod` v4
- **LangGraph config**: `langgraph.json` at project root maps graph name to `src/index.ts:graph`
- **Environment**: `.env` at project root; requires `ANTHROPIC_API_KEY`

### Code style
- Prettier: single quotes, semicolons, trailing commas (es5), 2-space indent, 80 char width
- ESLint: `plugin:@typescript-eslint/recommended`, `no-console: off`, `prefer-const: error`
- Arrange code as: state definitions, node functions, graph construction
- Comments on major code blocks

## Critical rules

1. **Nodes with `{ ends }` MUST return Command** — never `Partial<State>`. Returning plain state causes the graph to silently halt.
2. **Always use `?? 0` for numeric state fields** — registry defaults may not survive checkpointer serialization. E.g., `(state.iterationCount ?? 0) + 1`.
3. **Cap search queries to 5 max** — LLMs over-generate queries. Cap in both the prompt and the code.
4. **Use `--env-file=.env`** with tsx — it does not auto-load .env files.
5. **All imports use `.js` extension** — required by ESM module resolution.
6. **No emojis in generated replies** — enforced in prompt constraints.
7. **Reply drafts max 4 sentences** — human founder tone, not AI-sounding.
8. **Security**: validate file paths (no traversal, .md extension, < 50KB), no secrets in code.
9. **Native modules**: `better-sqlite3` needs `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` in package.json.
10. **Backward compatibility**: bare `reject` must still work as `reject_reply` in review-reply.ts.

## SOP Reference

Detailed procedures are in `docs/SOP/`:
- `langgraph-state-and-reducers.md` — State schemas, reducer patterns, defaults gotchas
- `langgraph-command-routing.md` — Static vs dynamic edges, Command pattern, self-loops
- `langgraph-interrupts-and-resume.md` — interrupt(), resume, SQLite persistence, sequential review
- `subprocess-and-search.md` — Python subprocess execution, last30days integration, query capping
- `llm-structured-output-and-prompts.md` — withStructuredOutput, prompt templates, filtering, rejection context
- `typescript-esm-and-tooling.md` — ESM imports, pnpm, tsx, ESLint config, LangGraph Studio
- `testing-and-debugging.md` — Test patterns, common bugs, debugging tips
- `agent-architecture-patterns.md` — Graph design, node signatures, file organization, evaluation filtering

## Configuration

### Environment variables (`.env`)
```
ANTHROPIC_API_KEY=<key>
AUTO_POST_ENABLED=false
DISTRIBUTION_AGENT_MAX_ITERATIONS=5
DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT=20
DISTRIBUTION_AGENT_DB_PATH=./distribution-agent.sqlite
```

### Config constants (`src/config.ts`)
```
ANTHROPIC_MODEL: claude-sonnet-4-6
MAX_ITERATIONS: 5
DEFAULT_TARGET_COUNT: 20
SEARCH_TIMEOUT_MS: 5 minutes
REPLY_MAX_SENTENCES: 4
REPLY_CONCURRENCY_LIMIT: 5
AUTO_POST_ENABLED: false (config flag for future auto-posting)
LAST30DAYS_SCRIPT: ~/.claude/skills/last30days/scripts/last30days.py
SUPPORTED_PLATFORMS: reddit, x, hn, youtube, tiktok, instagram, web
```
