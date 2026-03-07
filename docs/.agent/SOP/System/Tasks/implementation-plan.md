# Distribution Agent - Implementation Plan

## Context

Build a LangGraph-based Distribution Agent that automates product outreach. The agent reads a business description (.md file), searches for potential customers across platforms (X, Reddit, YouTube, TikTok, Instagram, Hacker News, web), evaluates results through an iterative refinement loop, generates human-sounding reply drafts, and presents them one-by-one for user approval before posting.

This project lives inside `lca-langgraph-essentials/js/` and follows the established L1/L2 patterns (Zod state schemas, Command routing, interrupt() for human-in-the-loop).

---

## Key Decisions (from interview)

| Decision | Choice |
|----------|--------|
| Search engine | `last30days` Python skill via standalone MCP server + direct subprocess for graph |
| MCP server location | `~/.claude/mcp-servers/last30days-mcp/` (standalone, reusable) |
| Platforms | All (reddit, x, youtube, tiktok, instagram, hn, web) -- platform-specific search |
| LLM | Claude (Anthropic) for all reasoning |
| Eval loop | LLM re-evaluates results for product-market fit; max 5 iterations; keeps full history |
| 5-iter failure | Soft pause via `interrupt()`, user provides guidance, agent resumes |
| Memory | LangGraph Store for cross-session persistent search strategies |
| Business file | Generic agent; user specifies .md path at runtime; need to create template |
| Business understanding | Dedicated node reads .md, generates structured summary, stored in state |
| Tone | User provides `tone_examples.md` with 3-5 real replies as few-shot examples |
| Batch size | 15-25 targets per run |
| Review UX | One-by-one sequential: interrupt() per draft, approve/edit/reject |
| Reject flow | Regenerate with user feedback; keep trying until approve or explicit skip |
| Auto-posting | Build infrastructure with config flag off (no write tokens yet); clipboard + link fallback |
| Safety | No automated filter -- user decides during one-by-one review |
| Checkpointer | SQLite for full resume across process restarts |
| Runtime | LangGraph Studio + CLI |
| Build order | MCP server first, then agent |

---

## File Structure

### Project A: last30days MCP Server
```
~/.claude/mcp-servers/last30days-mcp/
  package.json
  tsconfig.json
  src/
    index.ts              # MCP server entry (stdio transport)
    tools/search.ts       # last30days_search tool definition
    lib/runner.ts         # Spawns python3 last30days.py, parses JSON
    lib/types.ts          # TS types mirroring last30days Report/Item
```

### Project B: Distribution Agent
```
js/src/distribution-agent/
  index.ts                # Graph construction + compile + export `graph`
  state.ts                # All Zod state schemas + TS types
  config.ts               # Config constants from env
  nodes/
    get-input.ts          # Collect user input (interrupt)
    understand-business.ts # Read .md, LLM structured understanding
    generate-criteria.ts  # LLM generates search keywords/queries
    search.ts             # Call last30days via subprocess
    evaluate.ts           # LLM evaluates product-market fit
    refine-search.ts      # LLM refines criteria from failure history
    ask-user-help.ts      # Interrupt after 5 failures
    generate-replies.ts   # LLM generates reply drafts (batch)
    review-reply.ts       # Interrupt per draft: approve/edit/reject
    post-reply.ts         # Auto-post (if enabled) or clipboard+link
    save-memory.ts        # Persist winning strategy to Store
  lib/
    llm.ts                # Shared ChatAnthropic instance
    search-runner.ts      # child_process wrapper for last30days.py
    prompts.ts            # All prompt templates
  templates/
    business-description.md  # Template for users
```

### Files to Modify
- `js/langgraph.json` -- register `"distribution-agent"` graph
- `js/package.json` -- add `@langchain/langgraph-checkpoint-sqlite`
- `js/.env` -- add `ANTHROPIC_API_KEY`, `AUTO_POST_ENABLED=false`

---

## Graph Flow

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

### Edge Routing
- **evaluate**: Returns `Command` routing to `generateReplies` | `refineSearch` | `askUserHelp`. Declared with `{ ends: [...] }`.
- **askUserHelp**: Returns `Command` routing to `refineSearch` after user provides guidance.
- **reviewReply**: Returns `Command` routing to `postReply` | `reviewReply` (regenerate) | `saveMemory` (all done).
- **postReply**: Returns `Command` routing to `reviewReply` (next draft) | `saveMemory`.
- All other edges are static `.addEdge()`.

---

## State Schema (key fields)

```
businessFilePath: string
toneFilePath: string (optional)
selectedPlatforms: string[]
targetCount: number (default 20)
businessUnderstanding: { summary, targetAudience[], valueProposition, keyFeatures[], searchCriteria[] }
toneExamples: string (raw tone file content)
searchCriteria: { keywords[], queries[], platformFilters[], depth }
searchResults: SearchResultItem[] (reducer: dedupe merge by id)
evaluationHistory: EvaluationRecord[] (reducer: append)
iterationCount: number
searchSatisfactory: boolean
userGuidance: string (optional)
approvedTargets: SearchResultItem[]
replyDrafts: ReplyDraft[] (reducer: upsert by targetId)
currentReviewIndex: number
postedReplies: PostedReply[] (reducer: append)
```

Arrays use Zod `register(registry, { reducer })` pattern from L1/02-parallel-execution.ts.

---

## Reusable Code from Existing Codebase

| What | File | Usage |
|------|------|-------|
| `getUserInput()` | `js/src/utils.ts` | CLI interactive prompts |
| `generateId()` | `js/src/utils.ts` | Unique IDs for threads/replies |
| `interrupt()` + `Command` pattern | `js/src/L1/05-interrupts.ts` | Human-in-the-loop (getInput, askUserHelp, reviewReply) |
| `llm.withStructuredOutput(Schema)` | `js/src/L2/email-workflow-complete.ts:97` | All structured LLM calls |
| `Command` routing with `{ ends }` | `js/src/L2/email-workflow-complete.ts:437` | evaluate, reviewReply, postReply nodes |
| State schema + registry pattern | `js/src/L1/05-interrupts.ts:16-23` | State definition with reducers |
| Graph construction pattern | `js/src/L2/email-workflow-complete.ts:431-449` | addNode/addEdge/compile structure |

---

## Task Breakdown (16 tasks)

### Task 0: Project Scaffolding
- [x] Status: DONE
- Create directory structure under `js/src/distribution-agent/`
- Create `state.ts` with all Zod schemas
- Create `config.ts` with env-based constants
- Create `lib/llm.ts` with shared ChatAnthropic instance
- Create skeleton `index.ts` with minimal graph exporting `graph`
- Register in `js/langgraph.json`
- Add `@langchain/langgraph-checkpoint-sqlite` to `js/package.json`
- Run `pnpm install && pnpm typecheck`

### Task 1: MCP Server for last30days
- [x] Status: DONE
- Build standalone MCP server at `~/.claude/mcp-servers/last30days-mcp/`
- Wraps `python3 last30days.py` with `--emit=json` and `--search=<platforms>` flags
- Exposes `last30days_search` tool via stdio transport
- Test with real query

### Task 2: Search Runner (for graph)
- [x] Status: DONE
- Build `lib/search-runner.ts`
- `child_process.execFile` wrapper calling `python3 ~/.claude/skills/last30days/scripts/last30days.py`
- Accepts query, platforms, depth; returns parsed `SearchResultItem[]`
- 5-minute timeout, error handling

### Task 3: Prompt Templates
- [x] Status: DONE
- Build `lib/prompts.ts` with all prompt templates
- Templates: business understanding, criteria generation, evaluation, criteria refinement, reply generation
- Each is a function taking state fields, returning formatted string

### Task 4: `getInput` Node
- [x] Status: DONE
- Interrupt for: business .md path, platform selection, target count, tone file path
- Validate file paths exist
- For Studio: check if fields already populated (skip interrupt)

### Task 5: `understandBusiness` Node
- [x] Status: DONE
- Read .md file from disk (validate path, size < 50KB, .md extension)
- Read tone file if provided
- Call `llm.withStructuredOutput(BusinessUnderstandingSchema)`
- Store structured understanding in state

### Task 6: `generateCriteria` Node
- [x] Status: DONE
- Take business understanding + evaluation history (if any) + user guidance (if any)
- Call `llm.withStructuredOutput(SearchCriteriaSchema)`
- Return search criteria

### Task 7: `search` Node
- [x] Status: DONE
- For each query in criteria, call search runner with platform filters
- Normalize results into `SearchResultItem[]`
- Handle partial failures gracefully

### Task 8: `evaluate` + `refineSearch` Nodes
- [x] Status: DONE
- Evaluate: LLM scores results for product-market fit
- Returns `Command` routing to `generateReplies` / `refineSearch` / `askUserHelp`
- Increments iteration count, appends to evaluation history
- RefineSearch: LLM generates improved criteria from history

### Task 9: `askUserHelp` Node
- [x] Status: DONE
- Compile report of all 5 iterations
- `interrupt()` with report + request for guidance
- On resume: capture guidance, reset iteration count, route to `refineSearch`

### Task 10: `generateReplies` Node
- [x] Status: DONE
- Filter + sort results by score, take top N
- For each target, call Claude with reply constraints (max 4 sentences, no emojis, founder tone)
- Include tone examples as few-shot
- Batch with `Promise.allSettled` (concurrency limit 5)

### Task 11: `reviewReply` Node
- [x] Status: DONE
- Check if done (index >= drafts.length -> saveMemory)
- `interrupt()` with original post + draft
- Handle: approve (-> postReply), edit (update draft -> postReply), reject (feedback, regenerate -> reviewReply), skip (increment -> reviewReply)

### Task 12: `postReply` Node
- [x] Status: DONE
- If `AUTO_POST_ENABLED=false`: log reply for clipboard, log target URL
- If true (future): call platform API
- Append to `postedReplies`, increment review index
- Route to `reviewReply` or `saveMemory`

### Task 13: `saveMemory` Node
- [x] Status: DONE
- Extract winning strategy metadata
- Save to LangGraph Store (namespace: `['distribution-agent', 'strategies']`)
- Log run summary

### Task 14: Business Description Template
- [x] Status: DONE
- Create `templates/business-description.md`
- Sections: Business Name, One-line Description, Problem Being Solved, Target Audience, Key Features, Product Links, Pricing Model, Differentiators

### Task 15: Integration Testing and Polish
- [x] Status: DONE (ALL SUBTESTS COMPLETE)
- End-to-end CLI test completed successfully (test-run.ts)
- Full pipeline: getInput -> understandBusiness -> generateCriteria -> search -> evaluate -> generateReplies -> reviewReply -> postReply -> saveMemory
- Advanced test suite (test-advanced.ts): 15/15 tests passed
- Fixes applied:
  - Query cap (max 5 per run) to avoid excessive search time
  - iterationCount NaN fix (added ?? 0 fallback in evaluate, save-memory, ask-user-help)
  - Command routing in getInput (always returns Command, not plain object)
  - Irrelevant result filtering (evaluate now returns topResultIds, generateReplies uses approvedTargets)
  - ESLint config fix (plugin:@typescript-eslint/recommended, removed invalid rule)
- LangGraph Studio: PASSED - graph registered, server started on port 2024, hot-reload working
- SQLite resume: PASSED - state persisted to disk, resumed successfully from checkpoint
- Reject-and-regenerate: PASSED - draft rejected with feedback, LLM regenerated different draft
- iterationCount: PASSED - correctly shows 1 (not NaN/null)
- Prettier/ESLint: PASSED - all distribution-agent files clean, zero lint issues
- TypeScript: PASSED - pnpm typecheck with no errors
- Checkpointer: Swapped from MemorySaver to SqliteSaver for production persistence

---

## Configuration

### `.env` additions (at `js/.env`)
```
ANTHROPIC_API_KEY=your_key
AUTO_POST_ENABLED=false
DISTRIBUTION_AGENT_MAX_ITERATIONS=5
DISTRIBUTION_AGENT_DEFAULT_TARGET_COUNT=20
DISTRIBUTION_AGENT_DB_PATH=./distribution-agent.sqlite
```

### `langgraph.json` addition
```json
"distribution-agent": "src/distribution-agent/index.ts:graph"
```

### `config.ts` constants
```
MAX_ITERATIONS, DEFAULT_TARGET_COUNT, AUTO_POST_ENABLED, DB_PATH,
LAST30DAYS_SCRIPT path, SUPPORTED_PLATFORMS, REPLY_MAX_SENTENCES (4),
ANTHROPIC_MODEL (claude-sonnet-4-20250514)
```

---

## Verification

1. **Type check**: `cd js && pnpm typecheck` -- no errors
2. **MCP server**: Run standalone, call `last30days_search` with test query, verify JSON response
3. **Search runner**: `pnpm tsx` a test script that calls the runner, verify parsed results
4. **LangGraph Studio**: `pnpm dev` -- verify distribution-agent graph appears, visualize the flow
5. **Full E2E**: Run with a test business.md, step through all interrupts, verify:
   - getInput collects inputs correctly
   - understandBusiness produces valid structured output
   - search returns real results
   - evaluate loop works (both satisfactory and refinement paths)
   - generateReplies produces compliant drafts (no emojis, <= 4 sentences)
   - reviewReply interrupt shows post + draft, approve/edit/reject all work
   - reject-with-feedback regenerates correctly
   - postReply logs clipboard text + URL
   - saveMemory persists strategy
6. **Resume test**: Start run, interrupt mid-review, kill process, restart, resume with same thread_id
7. **5-iteration test**: Mock evaluate to always fail, verify askUserHelp fires after exactly 5 iterations
