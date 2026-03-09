# System Architecture

## Project Goal

Distribution Agent is a LangGraph-based TypeScript automation agent for product outreach. It searches multiple social media and web platforms for relevant conversations, evaluates results for product-market fit, generates contextual reply drafts matching the founder's tone, and presents them one-by-one for user approval before posting.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >=20, TypeScript 5, ESM |
| Graph engine | `@langchain/langgraph` ^1.0.0 |
| LLM | `@langchain/anthropic` ^1.0.0 (Claude Sonnet) |
| Schema validation | `zod` ^4 (registry-based reducers) |
| Persistence | `@langchain/langgraph-checkpoint-sqlite` (SQLite) |
| Search | `last30days.py` skill (Python subprocess) |
| Package manager | pnpm v10 |
| Dev tooling | tsx, ESLint, Prettier, LangGraph CLI/Studio |

## Project Structure

```
src/
├── index.ts                  # Graph definition (11 nodes, edges, checkpointer)
├── state.ts                  # Zod state schema with reducers
├── config.ts                 # Environment config & constants
├── nodes/
│   ├── get-input.ts          # Interrupt: collect user inputs
│   ├── understand-business.ts# Parse .md → BusinessUnderstanding
│   ├── generate-criteria.ts  # LLM → SearchCriteria
│   ├── search.ts             # Subprocess → last30days.py
│   ├── evaluate.ts           # LLM evaluates results, routes next
│   ├── refine-search.ts      # LLM improves criteria from history
│   ├── ask-user-help.ts      # Interrupt after 5 failed iterations
│   ├── generate-replies.ts   # Batched reply generation (concurrency=5)
│   ├── review-reply.ts       # Sequential interrupt per draft
│   ├── post-reply.ts         # Manual or auto-post
│   └── save-memory.ts        # Persist strategy to disk
├── lib/
│   ├── llm.ts                # Shared ChatAnthropic instance
│   ├── prompts.ts            # 5 prompt functions (pure, no LLM calls)
│   └── search-runner.ts      # Subprocess wrapper for last30days.py
└── test-run.ts, test-advanced.ts
```

## Graph Flow

```
START → getInput → understandBusiness → generateCriteria → search → evaluate
                                                            ↑           |
                                                            |    [satisfactory?]
                                                            |     /     |       \
                                                            |   yes   no(<5)   no(>=5)
                                                            |   /       |         \
                                                   generateReplies  refineSearch  askUserHelp
                                                            |                      ↓
                                                      reviewReply ←──────── (reset + refine)
                                                            |
                                                       postReply
                                                            |
                                                       saveMemory → END
```

### Node Routing Summary

| Node | Routing | Mechanism |
|------|---------|-----------|
| getInput | → understandBusiness | Static edge |
| understandBusiness | → generateCriteria | Static edge |
| generateCriteria | → search | Static edge |
| search | → evaluate | Static edge |
| evaluate | → generateReplies / refineSearch / askUserHelp | Command (dynamic) |
| refineSearch | → search | Static edge |
| askUserHelp | → refineSearch | Static edge |
| generateReplies | → reviewReply | Static edge |
| reviewReply | → postReply / reviewReply / saveMemory | Command (dynamic) |
| postReply | → reviewReply / saveMemory | Command (dynamic) |
| saveMemory | → END | Static edge |

## Integration Points

### 1. Anthropic Claude API
- Model: `claude-sonnet-4-6` (configurable via `config.ts`)
- Used in: understandBusiness, generateCriteria, evaluate, generateReplies, reviewReply (regenerate)
- Structured output via `.withStructuredOutput(ZodSchema)`
- Auth: `ANTHROPIC_API_KEY` env var

### 2. last30days.py (Search)
- Path: `~/.claude/skills/last30days/scripts/last30days.py`
- Invoked as: `python3 last30days.py <query> --emit=json --search=<platforms> [--quick|--deep]`
- Platforms: reddit, x, web, youtube, tiktok, instagram, hackernews
- Timeout: 5 minutes
- Queries capped at 5, run in parallel via `Promise.allSettled()`

### 3. LangGraph Studio
- Config: `langgraph.json` → `src/index.ts:graph`
- Launch: `pnpm dev`
- Visual debugging, interrupt handling, state editing

### 4. File System
- Business description: user-provided `.md` file (max 50KB)
- Tone examples: optional `.md` with per-platform `##` sections
- SQLite DB: `./distribution-agent.sqlite`
- Strategy memory: `~/.distribution-agent/search-strategies.json` (last 50 strategies)

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `ANTHROPIC_API_KEY` | required | Anthropic API key |
| `DISTRIBUTION_AGENT_MAX_ITERATIONS` | 5 | Max evaluate iterations before askUserHelp |
| `DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT` | 20 | Default number of reply targets |
| `DISTRIBUTION_AGENT_DB_PATH` | `./distribution-agent.sqlite` | SQLite path |
| `AUTO_POST_ENABLED` | false | Auto-post replies or manual (clipboard) |

### Hardcoded Constants (config.ts)

- `ANTHROPIC_MODEL`: `claude-sonnet-4-6`
- `SUPPORTED_PLATFORMS`: reddit, x, hn, youtube, tiktok, instagram, web
- `REPLY_MAX_SENTENCES`: 4
- `REPLY_CONCURRENCY_LIMIT`: 5
- `SEARCH_TIMEOUT_MS`: 300,000 (5 min)
- `MAX_BUSINESS_FILE_SIZE`: 51,200 (50 KB)

## Persistence

### SQLite Checkpointer
- Full state serialization for resumability across process restarts
- Created via `SqliteSaver.fromConnString(CONFIG.DB_PATH)`

### Search Strategy Memory
- Path: `~/.distribution-agent/search-strategies.json`
- Stores: timestamp, business summary, platforms, winning criteria, iterations, results count, replies generated/posted, rejection patterns
- Auto-trimmed to last 50 entries

## Key Patterns

- **Command routing**: Nodes with multiple destinations return `Command { update, goto }`
- **Interrupt-based control**: 3 interrupts (getInput, askUserHelp, reviewReply) for user interaction
- **Rejection feedback loop**: `reject_target` notes injected into criteria + evaluation prompts
- **State reducers**: Dedup by ID (searchResults, approvedTargets), append (evaluationHistory, rejectionNotes, postedReplies), upsert by targetId (replyDrafts)

## Related Documentation

- `CLAUDE.md` — Claude Code instructions and workflow rules
- `docs/The_agent_specs.md` — Full requirements specification
- `.agent/SOP/agent-architecture-patterns.md` — Detailed architecture patterns
- `.agent/SOP/langgraph-state-and-reducers.md` — State schema details
