# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The Distribution Agent is a LangGraph-based agent that automates product distribution outreach. It reads a business description (.md file), identifies potential customers on platforms (X/Twitter, Reddit, YouTube, TikTok, Instagram, Hacker News, websites), evaluates search results through an iterative refinement loop (up to 5 iterations), generates human-sounding reply drafts, and stages them for one-by-one review before posting.

This project lives inside the `lca-langgraph-essentials` monorepo:
- **Agent config + docs**: `js/Distribution_Agent/` (CLAUDE.md, specs, SOP, business.md, tone_examples.md)
- **Agent source code**: `js/src/distribution-agent/` (all .ts files)
- **Parent monorepo**: `js/` (LangGraph tutorial examples L1/L2 as reference)

See `The_agent_specs.md` for full requirements, `SOP/` for operational procedures.

## Commands

```bash
# All commands run from the js/ directory (parent)
cd /Users/saud/lca-langgraph-essentials/js

# Install dependencies (pnpm not in PATH — use npx)
npx pnpm install

# Run a TypeScript file directly (must use --env-file for .env loading)
npx pnpm tsx --env-file=.env src/distribution-agent/test-run.ts

# Launch LangGraph Studio (dev server)
npx pnpm dev

# Type check
npx pnpm typecheck

# Lint (zero issues expected in distribution-agent code)
npx pnpm lint

# Format
npx pnpm format

# Clean SQLite before fresh test run
rm -f distribution-agent.sqlite

# Run basic integration test
npx pnpm tsx --env-file=.env src/distribution-agent/test-run.ts

# Run advanced test (reject-regenerate, SQLite resume, iteration counter)
npx pnpm tsx --env-file=.env src/distribution-agent/test-advanced.ts
```

## Architecture

### Source code layout
```
js/src/distribution-agent/
  index.ts                # Graph construction + compile + export `graph`
  state.ts                # All Zod state schemas + TS types (reducers for arrays)
  config.ts               # Config constants from env
  nodes/                  # One file per node function
    get-input.ts          # Collect user input (interrupt) or use pre-populated state
    understand-business.ts # Read .md file, LLM structured understanding
    generate-criteria.ts  # LLM generates search keywords/queries
    search.ts             # Call last30days via subprocess (capped to 5 queries)
    evaluate.ts           # LLM evaluates product-market fit, filters relevant results
    refine-search.ts      # LLM refines criteria from evaluation history
    ask-user-help.ts      # Interrupt after 5 failed iterations
    generate-replies.ts   # LLM generates reply drafts (batch, concurrency 5)
    review-reply.ts       # Interrupt per draft: approve/edit/reject/skip
    post-reply.ts         # Clipboard+link output (auto-post behind config flag)
    save-memory.ts        # Persist winning strategy to ~/.distribution-agent/
  lib/
    llm.ts                # Shared ChatAnthropic instance
    search-runner.ts      # child_process wrapper for last30days.py
    prompts.ts            # All prompt templates (5 functions)
  templates/
    business-description.md  # Template for users
  test-run.ts             # Basic E2E test (auto-approve all)
  test-advanced.ts        # Advanced test (reject, resume, assertions)
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
                                                           /    |    \   |
                                                      approve edit reject(regen)
                                                          \    |      |
                                                          postReply   +-> reviewReply (same index)
                                                               |
                                                         [next or done]
                                                               |
                                                          saveMemory -> END
```

### Key patterns
- **State**: Zod schemas with `register(registry, { reducer })` for arrays (dedup, append, upsert)
- **Routing**: `Command` objects with `{ ends: [...] }` for conditional transitions
- **Human-in-the-loop**: `interrupt()` + `Command({ resume })` for user interaction
- **Checkpointer**: SqliteSaver for persistent state across restarts
- **Structured output**: `llm.withStructuredOutput(ZodSchema)` for typed LLM responses

### Parent repo
- **Package manager**: pnpm (binary not in PATH — always use `npx pnpm`)
- **Runtime**: Node.js 20+, ESM modules (`"type": "module"`)
- **TypeScript**: Strict mode, ESNext target. All imports use `.js` extension.
- **Dependencies**: `@langchain/langgraph`, `@langchain/anthropic`, `@langchain/langgraph-checkpoint-sqlite`, `zod` v4
- **LangGraph config**: `langgraph.json` at `js/` root maps graph names to exports
- **Environment**: `.env` at `js/` root; requires `ANTHROPIC_API_KEY`

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
5. **Use `npx pnpm`** — pnpm binary is not in PATH on this system.
6. **All imports use `.js` extension** — required by ESM module resolution.
7. **No emojis in generated replies** — enforced in prompt constraints.
8. **Reply drafts max 4 sentences** — human founder tone, not AI-sounding.
9. **Security**: validate file paths (no traversal, .md extension, < 50KB), no secrets in code.
10. **Native modules**: `better-sqlite3` needs `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` in package.json.

## SOP Reference

Detailed procedures are in `SOP/`:
- `langgraph-state-and-reducers.md` — State schemas, reducer patterns, defaults gotchas
- `langgraph-command-routing.md` — Static vs dynamic edges, Command pattern, self-loops
- `langgraph-interrupts-and-resume.md` — interrupt(), resume, SQLite persistence, sequential review
- `subprocess-and-search.md` — Python subprocess execution, last30days integration, query capping
- `llm-structured-output-and-prompts.md` — withStructuredOutput, prompt templates, filtering
- `typescript-esm-and-tooling.md` — ESM imports, pnpm, tsx, ESLint config, LangGraph Studio
- `testing-and-debugging.md` — Test patterns, common bugs, debugging tips
- `agent-architecture-patterns.md` — Graph design, node signatures, file organization, evaluation filtering

## Configuration

### Environment variables (`js/.env`)
```
ANTHROPIC_API_KEY=<key>
AUTO_POST_ENABLED=false
DISTRIBUTION_AGENT_MAX_ITERATIONS=5
DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT=20
DISTRIBUTION_AGENT_DB_PATH=./distribution-agent.sqlite
```

### Config constants (`config.ts`)
```
ANTHROPIC_MODEL: claude-sonnet-4-20250514
MAX_ITERATIONS: 5
DEFAULT_TARGET_COUNT: 20
SEARCH_TIMEOUT_MS: 5 minutes
REPLY_MAX_SENTENCES: 4
REPLY_CONCURRENCY_LIMIT: 5
AUTO_POST_ENABLED: false (config flag for future auto-posting)
LAST30DAYS_SCRIPT: ~/.claude/skills/last30days/scripts/last30days.py
SUPPORTED_PLATFORMS: reddit, x, hn, youtube, tiktok, instagram, web
```
