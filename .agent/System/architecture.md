# System Architecture

## Project Goal

Distribution Agent is a LangGraph-based TypeScript automation agent with two independent paths:

1. **Business Path** — Product outreach. Searches platforms for relevant conversations, evaluates results for product-market fit, generates contextual reply drafts, and posts after user approval.
2. **Idea Path** — Idea validation. Given a problem hypothesis, discovers people and communities who experience the problem, generates validation-focused outreach, and exports targets to CSV.

Both paths share a single graph with a mode switch at `getInput`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >=20, TypeScript 5, ESM |
| Graph engine | `@langchain/langgraph` ^1.0.0 |
| LLM | `@langchain/anthropic` ^1.0.0 (Claude Sonnet) |
| Schema validation | `zod` ^4 (registry-based reducers) |
| Persistence | `@langchain/langgraph-checkpoint-sqlite` (SQLite) |
| Search | `last30days.py` skill (Python subprocess) |
| Enrichment APIs | Reddit public endpoint, X API v2 (built-in `fetch`) |
| CSV export | Manual RFC 4180 writer (no external library) |
| Package manager | pnpm v10 |
| Dev tooling | tsx, ESLint, Prettier, LangGraph CLI/Studio |

## Project Structure

```
src/
├── index.ts                        # Graph definition (23 nodes, edges, checkpointer)
├── state.ts                        # Zod state schema with reducers
├── config.ts                       # Environment config & constants
├── nodes/
│   ├── get-input.ts                # Interrupt: mode selection + input collection
│   │
│   │   === Business Path ===
│   ├── understand-business.ts      # Parse .md → BusinessUnderstanding
│   ├── generate-criteria.ts        # LLM → SearchCriteria
│   ├── search.ts                   # Subprocess → last30days.py
│   ├── evaluate.ts                 # LLM evaluates results, routes next
│   ├── refine-search.ts            # LLM improves criteria from history
│   ├── ask-user-help.ts            # Interrupt after 5 failed iterations
│   ├── generate-replies.ts         # Batched reply generation (concurrency=5)
│   ├── review-reply.ts             # Sequential interrupt per draft
│   ├── post-reply.ts               # Manual or auto-post
│   │
│   │   === Idea Path ===
│   ├── understand-idea.ts          # Parse idea.md → IdeaUnderstanding
│   ├── generate-idea-criteria.ts   # Content + community-discovery queries
│   ├── search-idea.ts              # Dual search (platforms + web)
│   ├── extract-targets.ts          # LLM extracts people/communities
│   ├── enrich-targets.ts           # Reddit/X API enrichment
│   ├── evaluate-idea-targets.ts    # Audience match evaluation
│   ├── refine-idea-search.ts       # Thin wrapper → delegates to generateIdeaCriteria
│   ├── ask-idea-help.ts            # Interrupt after max iterations
│   ├── batch-review-targets.ts     # Batch review + backfill loop
│   ├── generate-outreach.ts        # Validation-focused outreach drafts
│   ├── review-outreach.ts          # Batch outreach review
│   ├── export-csv.ts               # CSV file output
│   │
│   │   === Shared ===
│   └── save-memory.ts              # Persist strategy to disk (both modes)
├── lib/
│   ├── llm.ts                      # Shared ChatAnthropic instance
│   ├── prompts.ts                  # 11 prompt functions (pure, no LLM calls)
│   ├── search-runner.ts            # Subprocess wrapper for last30days.py
│   ├── enrichment.ts               # Reddit public endpoint, X API, URL verification
│   └── csv-writer.ts               # RFC 4180 CSV serialization
└── test-run.ts, test-advanced.ts
```

## Graph Flow

### Mode Selection

```
START → getInput → [mode?]
                     ├── business → understandBusiness → ...business path...
                     └── idea     → understandIdea     → ...idea path...
```

### Business Path

```
understandBusiness → generateCriteria → search → evaluate
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

### Idea Path

```
understandIdea → generateIdeaCriteria → searchIdea → extractTargets → enrichTargets → evaluateIdeaTargets
                        ↑                                                                      |
                        |                                                               [satisfactory?]
                        |                                                              /      |        \
                        |                                                            yes   no(<5)   no(>=5)
                        |                                                            /       |          \
                        |                                               batchReviewTargets  refineIdeaSearch  askIdeaHelp
                        |                                                    |                    |              |
                        |                                              [rejections?]               |         (guidance)
                        |                                              /          \                |              |
                        +-------(backfill)------------- yes            no         ←───────────────+
                                                                       |
                                                                generateOutreach → reviewOutreach → exportCsv → saveMemory → END
```

### Node Routing Summary

| Node | Routing | Mechanism |
|------|---------|-----------|
| getInput | → understandBusiness / understandIdea | Command (dynamic) |
| **Business Path** | | |
| understandBusiness | → generateCriteria | Static edge |
| generateCriteria | → search | Static edge |
| search | → evaluate | Static edge |
| evaluate | → generateReplies / refineSearch / askUserHelp | Command (dynamic) |
| refineSearch | → search | Static edge |
| askUserHelp | → refineSearch | Command (dynamic) |
| generateReplies | → reviewReply | Static edge |
| reviewReply | → postReply / reviewReply / saveMemory | Command (dynamic) |
| postReply | → reviewReply / saveMemory | Command (dynamic) |
| **Idea Path** | | |
| understandIdea | → generateIdeaCriteria | Static edge |
| generateIdeaCriteria | → searchIdea | Static edge |
| searchIdea | → extractTargets | Static edge |
| extractTargets | → enrichTargets | Static edge |
| enrichTargets | → evaluateIdeaTargets | Static edge |
| evaluateIdeaTargets | → batchReviewTargets / refineIdeaSearch / askIdeaHelp | Command (dynamic) |
| refineIdeaSearch | → searchIdea | Static edge |
| askIdeaHelp | → refineIdeaSearch | Command (dynamic) |
| batchReviewTargets | → generateOutreach / generateIdeaCriteria | Command (dynamic) |
| generateOutreach | → reviewOutreach | Static edge |
| reviewOutreach | → exportCsv | Command (dynamic) |
| exportCsv | → saveMemory | Static edge |
| **Shared** | | |
| saveMemory | → END | Static edge |

## Integration Points

### 1. Anthropic Claude API
- Model: `claude-sonnet-4-6` (configurable via `config.ts`)
- **Business path**: understandBusiness, generateCriteria, evaluate, generateReplies, reviewReply (regenerate)
- **Idea path**: understandIdea, generateIdeaCriteria, extractTargets, evaluateIdeaTargets, generateOutreach, reviewOutreach (regenerate)
- Structured output via `.withStructuredOutput(ZodSchema)`
- Auth: `ANTHROPIC_API_KEY` env var

### 2. last30days.py (Search)
- Path: `~/.claude/skills/last30days/scripts/last30days.py`
- Invoked as: `python3 last30days.py <query> --emit=json --search=<platforms> [--quick|--deep]`
- Platforms: reddit, x, web, youtube, tiktok, instagram, hackernews
- Timeout: 5 minutes
- Queries capped at 5 (content) + 3 (community discovery for idea path)
- All queries run in parallel via `Promise.allSettled()`

### 3. Reddit Public Endpoint (Idea Path Enrichment)
- Subreddit member count → `GET https://www.reddit.com/r/{subreddit}/about.json`
- No auth required (public endpoint)
- Timeout: 10s per request

### 4. X/Twitter API v2 (Idea Path Enrichment)
- Follower count → `GET /2/users/by/username/{username}?user.fields=public_metrics`
- Auth: `X_BEARER_TOKEN` env var
- Timeout: 10s per request

### 5. LangGraph Studio
- Config: `langgraph.json` → `src/index.ts:graph`
- Launch: `pnpm dev`
- Visual debugging, interrupt handling, state editing

### 6. File System
- Business description: user-provided `.md` file (max 50KB)
- Idea description: user-provided `.md` file (max 50KB)
- Tone examples: optional `.md` with per-platform `##` sections
- SQLite DB: `./distribution-agent.sqlite`
- Strategy memory: `~/.distribution-agent/search-strategies.json` (last 50 strategies)
- CSV output: `./output/idea-targets-{timestamp}.csv`

## Configuration

| Env Var | Default | Purpose |
|---------|---------|---------|
| `ANTHROPIC_API_KEY` | required | Anthropic API key |
| `DISTRIBUTION_AGENT_MAX_ITERATIONS` | 5 | Max evaluate iterations before askUserHelp |
| `DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT` | 20 | Default number of reply targets |
| `DISTRIBUTION_AGENT_DB_PATH` | `./distribution-agent.sqlite` | SQLite path |
| `AUTO_POST_ENABLED` | false | Auto-post replies or manual (clipboard) |
| `X_BEARER_TOKEN` | optional (idea) | X/Twitter API v2 bearer token — enrichment skipped if missing |
| `DISTRIBUTION_AGENT_CSV_DIR` | `./output` | CSV export directory |

### Hardcoded Constants (config.ts)

- `ANTHROPIC_MODEL`: `claude-sonnet-4-6`
- `SUPPORTED_PLATFORMS`: reddit, x, hn, youtube, tiktok, instagram, web
- `REPLY_MAX_SENTENCES`: 4
- `REPLY_CONCURRENCY_LIMIT`: 5
- `SEARCH_TIMEOUT_MS`: 300,000 (5 min)
- `MAX_BUSINESS_FILE_SIZE`: 51,200 (50 KB)
- `IDEA_TARGET_CAP`: 50
- `IDEA_MAX_REVIEW_CYCLES`: 5
- `MAX_IDEA_FILE_SIZE`: 51,200 (50 KB)
- `ENRICHMENT_CONCURRENCY`: 10
- `ENRICHMENT_TIMEOUT_MS`: 10,000 (10 sec)

## Persistence

### SQLite Checkpointer
- Full state serialization for resumability across process restarts
- Created via `SqliteSaver.fromConnString(CONFIG.DB_PATH)`

### Search Strategy Memory
- Path: `~/.distribution-agent/search-strategies.json`
- Stores: timestamp, mode, business/idea summary, platforms, winning criteria, iterations, results count
- Business mode adds: replies generated/posted
- Idea mode adds: targets discovered, category counts, rejection patterns
- Auto-trimmed to last 50 entries

## Key Patterns

- **Dual-mode graph**: Single graph, `mode` field routes at `getInput` to business or idea path
- **Command routing**: Nodes with multiple destinations return `Command { update, goto }`
- **Interrupt-based control**: 6 interrupts total (getInput, askUserHelp, reviewReply for business; askIdeaHelp, batchReviewTargets, reviewOutreach for idea)
- **Rejection feedback loop**: Rejection notes injected into criteria + evaluation prompts (both paths)
- **Batch review with backfill**: Idea path reviews all targets at once; rejections trigger re-search to fill gaps
- **Dual search strategy**: Idea path runs content queries on user platforms + community-discovery queries on web
- **API enrichment**: Reddit/X APIs for follower counts (optional — soft-warn if keys missing), URL verification for community hubs
- **State reducers**: Dedup by ID (searchResults, approvedTargets), upsert by ID (replyDrafts, ideaTargets), append (evaluationHistory, rejectionNotes, postedReplies, ideaRejectionNotes)

## Related Documentation

- `CLAUDE.md` — Claude Code instructions and workflow rules
- `docs/The_agent_specs.md` — Full requirements specification
- `.agent/Tasks/idea-path-implementation.md` — Idea path feature spec and implementation plan
- `.agent/SOP/agent-architecture-patterns.md` — Detailed architecture patterns
- `.agent/SOP/langgraph-state-and-reducers.md` — State schema details
- `.agent/SOP/llm-structured-output-and-prompts.md` — Prompt engineering patterns
