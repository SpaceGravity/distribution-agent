# Idea Path — Feature Spec

## Context

The distribution agent currently has one path: business.md -> content search -> reply drafts -> posting. This spec adds a second path: **idea.md -> people/community discovery -> outreach drafts -> CSV export**. The purpose is idea validation — given a hypothesis about a problem, find the people and communities who experience it so the user can validate whether the problem is real and painful.

The two paths are **fully independent** (separate thread_id, no shared state) but share the same graph via a mode switch at `getInput`.

---

## Architecture: Single Graph, Mode Switch

A `mode` field (`"business" | "idea"`) is added to state. `getInput` asks the user which mode, then routes to either `understandBusiness` (existing) or `understandIdea` (new). All existing business path nodes remain untouched.

### Idea Path Graph Flow

```
START -> getInput --(mode=idea)--> understandIdea -> generateIdeaCriteria -> searchIdea -> extractTargets -> enrichTargets -> evaluateIdeaTargets
                                        ^                                                                                          |
                                        |                                                                                   [satisfactory?]
                                        |                                                                                  /      |        \
                                        |                                                                                yes   no(<5)   no(>=5)
                                        |                                                                                /       |          \
                                        |                                                                   batchReviewTargets  refineIdeaSearch  askIdeaHelp
                                        |                                                                        |                    |              |
                                        |                                                                  [rejections?]               |         (guidance)
                                        |                                                                  /          \                |              |
                                        +----------(backfill)-----------------------------yes               no         <---------------+
                                                                                                            |
                                                                                                     generateOutreach -> reviewOutreach -> exportCsv -> saveMemory -> END
```

---

## State Changes (`src/state.ts`)

### New Sub-schemas

**IdeaUnderstandingSchema:**
```ts
{
  rawText: string,
  problemHypothesis: string,
  targetDemographic: string[],
  assumptions: string[],
  existingSolutions: string[],
  keywords: string[],
  validationGoals: string[],
}
```

**IdeaTargetSchema:**
```ts
{
  id: string,
  name: string,                    // display name or handle
  platform: string,
  url: string,
  category: "potential_customer" | "domain_expert" | "community_hub" | "competitor_user",
  whyRelevant: string,
  followerCount: number | null,    // enriched via Reddit/X API
  sourcePostUrl: string,
  sourcePostTitle: string,
  outreachDraft: string,
  outreachType: "dm" | "post" | "comment",
  status: "pending" | "approved" | "rejected",
  rejectionReason: string | null,
}
```

**IdeaRejectionNoteSchema:**
```ts
{
  targetId: string,
  platform: string,
  name: string,
  reason: string,
  rejectedAt: string,
}
```

### New State Fields

| Field | Type | Reducer | Default |
|-------|------|---------|---------|
| `mode` | `z.enum(["business", "idea"]).optional()` | none | `undefined` (backward compat) |
| `ideaFilePath` | `z.string().optional()` | none | — |
| `ideaUnderstanding` | `IdeaUnderstandingSchema.optional()` | none | — |
| `ideaTargets` | `z.array(IdeaTargetSchema)` | upsert by id | `[]` |
| `ideaRejectionNotes` | `z.array(IdeaRejectionNoteSchema)` | append | `[]` |
| `ideaReviewCycle` | `z.number()` | none | `0` |
| `ideaCommunityQueries` | `z.array(z.string()).optional()` | none | — |
| `csvOutputPath` | `z.string().optional()` | none | — |

---

## Config Changes (`src/config.ts`)

```ts
IDEA_TARGET_CAP: 50,
IDEA_MAX_REVIEW_CYCLES: 5,
MAX_IDEA_FILE_SIZE: 50 * 1024,

// Enrichment API keys (required — blocks if missing)
REDDIT_CLIENT_ID: process.env.REDDIT_CLIENT_ID ?? '',
REDDIT_CLIENT_SECRET: process.env.REDDIT_CLIENT_SECRET ?? '',
X_BEARER_TOKEN: process.env.X_BEARER_TOKEN ?? '',

ENRICHMENT_CONCURRENCY: 10,
ENRICHMENT_TIMEOUT_MS: 10_000,

CSV_OUTPUT_DIR: resolve(process.env.DISTRIBUTION_AGENT_CSV_DIR ?? './output'),
```

---

## New Nodes (12 total)

### 1. `understandIdea` (`src/nodes/understand-idea.ts`)
- Read idea.md, validate (.md, exists, <50KB, no path traversal)
- LLM flexible extraction via `ideaUnderstandingPrompt()` with `withStructuredOutput(IdeaUnderstandingSchema)`
- Extracts whatever structure exists — adapts to one-liner or detailed hypothesis
- **Output:** `{ ideaUnderstanding }` -> static edge to `generateIdeaCriteria`

### 2. `generateIdeaCriteria` (`src/nodes/generate-idea-criteria.ts`)
- LLM generates two query sets from `ideaUnderstanding` + `ideaRejectionNotes` + `evaluationHistory`:
  - **Content queries** (max 5): find posts by people discussing the pain point
  - **Community-discovery queries** (max 3): meta-queries like "best subreddits for X", "top Discord servers for Y"
- Structured output: `SearchCriteria` + `ideaCommunityQueries: string[]`
- **Output:** `{ searchCriteria, ideaCommunityQueries }` -> static edge to `searchIdea`

### 3. `searchIdea` (`src/nodes/search-idea.ts`)
- Runs content queries via existing `searchPlatforms()` from `search-runner.ts` (reuses infra)
- Runs community-discovery queries via `searchPlatforms()` with `platformFilters: ['web']`
- All results merge into `searchResults` (existing dedup reducer handles it)
- **Output:** `{ searchResults }` -> static edge to `extractTargets`

### 4. `extractTargets` (`src/nodes/extract-targets.ts`)
- LLM processes search results to extract `IdeaTarget[]`:
  - From content results: extract **author** as person target + **community** (subreddit, forum) if visible
  - From web results (community articles): LLM extracts community names/URLs from article text
- Assigns category: `potential_customer | domain_expert | community_hub | competitor_user`
- Deduplicates within same platform (by normalized name/URL)
- Caps at 50 (`IDEA_TARGET_CAP`)
- **Output:** `{ ideaTargets }` -> static edge to `enrichTargets`

### 5. `enrichTargets` (`src/nodes/enrich-targets.ts`)
- **Validates API keys first** — if `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, or `X_BEARER_TOKEN` is empty, throws clear error listing required env vars
- Reddit targets: call Reddit API `GET /r/{subreddit}/about` -> extract `subscribers`
- X targets: call X API v2 `GET /users/by/username/{username}?user.fields=public_metrics` -> extract `followers_count`
- Other platforms: `followerCount: null`
- Community URL verification: HEAD request, filter out non-200
- Concurrency limited (`ENRICHMENT_CONCURRENCY: 10`)
- Individual failures: log warning, set `followerCount: null`, continue
- **Output:** `{ ideaTargets }` (updated via upsert) -> static edge to `evaluateIdeaTargets`

### 6. `evaluateIdeaTargets` (`src/nodes/evaluate-idea-targets.ts`)
- LLM evaluates targets against idea understanding
- **Primary signal: audience match** — does this person/community represent the target demographic?
- Also checks: category diversity, platform spread
- Excludes targets matching rejection patterns
- Returns `{ satisfactory, reasoning, approvedTargetIds, suggestedRefinements? }`
- **Routing (Command):**
  - Satisfactory -> `batchReviewTargets`
  - Not satisfactory, iterations < 5 -> `refineIdeaSearch`
  - Not satisfactory, iterations >= 5 -> `askIdeaHelp`
- **Must return Command** (declared with `{ ends }`)

### 7. `refineIdeaSearch` (`src/nodes/refine-idea-search.ts`)
- Thin wrapper: calls `ideaCriteriaPrompt()` with evaluation history and rejection notes
- New node (not modifying existing `refineSearch`) because prompts differ
- **Output:** `{ searchCriteria, ideaCommunityQueries }` -> static edge to `searchIdea`

### 8. `askIdeaHelp` (`src/nodes/ask-idea-help.ts`)
- Interrupts after max iterations, presenting idea-specific context (targets found, categories, what failed)
- User provides guidance text
- **Routing (Command):** -> `refineIdeaSearch`

### 9. `batchReviewTargets` (`src/nodes/batch-review-targets.ts`)
- If `ideaReviewCycle >= 5`: force-proceed to `generateOutreach`
- Interrupts with all targets (id, name, platform, url, category, whyRelevant, followerCount)
- User response: `{ approved: true }` or `{ rejections: [{ id, reason }] }`
- On approval: mark all approved, goto `generateOutreach`
- On rejections: record `IdeaRejectionNote` per rejection, remove rejected targets, increment `ideaReviewCycle`, goto `generateIdeaCriteria` (backfill loop)
- **Must return Command** (declared with `{ ends }`)

### 10. `generateOutreach` (`src/nodes/generate-outreach.ts`)
- For each approved target, determine outreach type:
  - `community_hub` -> `"post"` (intro/question post in community)
  - Individual (X user, Reddit user) -> `"dm"` (private message)
  - Found via specific thread -> `"comment"`
- LLM generates context-aware outreach drafts via `outreachDraftPrompt()`
- **Tone: validation-focused** (curious, question-asking, not pitching). Agent infers — no tone file
- Batch generation with concurrency limit 5
- **Output:** `{ ideaTargets }` (updated with outreach drafts) -> static edge to `reviewOutreach`

### 11. `reviewOutreach` (`src/nodes/review-outreach.ts`)
- **Batch review** — all drafts presented at once
- User can: approve all, edit specific drafts, reject specific targets
- After processing, goto `exportCsv`
- **Must return Command** (declared with `{ ends }`)

### 12. `exportCsv` (`src/nodes/export-csv.ts`)
- Creates output directory (`CSV_OUTPUT_DIR`)
- Filename: `idea-targets-{timestamp}.csv`
- **Columns:** `name, handle, platform, url, category, why_relevant, follower_count, outreach_draft, outreach_type, source_post_url, source_post_title`
- Full outreach draft text in CSV cell (RFC 4180 quoting handles newlines)
- **Output:** `{ csvOutputPath }` -> static edge to `saveMemory`

---

## New Library Files

### `src/lib/enrichment.ts`
- `getRedditAccessToken(clientId, clientSecret)` — OAuth2 client credentials flow
- `getSubredditMemberCount(subreddit, accessToken)` — GET `/r/{subreddit}/about`
- `getTwitterFollowerCount(username, bearerToken)` — GET `/users/by/username/{username}`
- `verifyUrl(url)` — HEAD request, returns true if 200-399
- Uses built-in `fetch` (Node 20+), no new dependencies

### `src/lib/csv-writer.ts`
- `escapeCsvField(value)` — RFC 4180 compliant escaping
- `writeCsv(rows, filePath)` — header + data rows to file
- No external library needed

---

## New Prompts (`src/lib/prompts.ts`)

6 new functions:

1. **`ideaUnderstandingPrompt(fileContent)`** — flexible extraction, adapts to input depth
2. **`ideaCriteriaPrompt(ideaUnderstanding, rejectionNotes?, evaluationHistory?)`** — generates content queries + community-discovery queries
3. **`extractTargetsPrompt(results, ideaUnderstanding)`** — extract people/communities from search results, assign categories
4. **`evaluateIdeaTargetsPrompt(targets, ideaUnderstanding, rejectionNotes?)`** — audience match evaluation
5. **`outreachDraftPrompt(target, ideaUnderstanding)`** — context-aware validation outreach (DM/post/comment)
6. **`outreachRegenerationPrompt(target, previousDraft, feedback, ideaUnderstanding)`** — re-draft after rejection

---

## Modified Existing Files

### `src/nodes/get-input.ts`
- Add `mode` field to interrupt (options: `business | idea`)
- Add `ideaFilePath` field (when mode=idea)
- Validate idea file same way as business file
- Route to `understandIdea` when `mode === 'idea'`
- Pre-populated state: if `state.ideaFilePath && state.mode === 'idea'`, skip interrupt

### `src/nodes/save-memory.ts`
- Extend `StrategyRecord` with optional idea fields:
  - `mode: 'business' | 'idea'`
  - `ideaSummary?: string`
  - `targetsDiscovered?: number`
  - `targetCategories?: Record<string, number>`
  - `ideaRejectionPatterns?: string[]`
- Populate when `state.mode === 'idea'`
- Idea-specific run summary log

### `src/index.ts`
- Import 12 new nodes
- Add all new `.addNode()` calls (with `{ ends }` for Command nodes)
- Add `'understandIdea'` to `getInput`'s `ends` array
- Add all new `.addEdge()` calls per topology above

---

## Graph Registration in `src/index.ts`

```ts
// getInput ends — MODIFIED
.addNode('getInput', getInput, {
  ends: ['understandBusiness', 'understandIdea'],
})

// --- New idea path nodes ---
.addNode('understandIdea', understandIdea)
.addNode('generateIdeaCriteria', generateIdeaCriteria)
.addNode('searchIdea', searchIdea)
.addNode('extractTargets', extractTargets)
.addNode('enrichTargets', enrichTargets)
.addNode('evaluateIdeaTargets', evaluateIdeaTargets, {
  ends: ['batchReviewTargets', 'refineIdeaSearch', 'askIdeaHelp'],
})
.addNode('refineIdeaSearch', refineIdeaSearch)
.addNode('askIdeaHelp', askIdeaHelp, { ends: ['refineIdeaSearch'] })
.addNode('batchReviewTargets', batchReviewTargets, {
  ends: ['generateOutreach', 'generateIdeaCriteria'],
})
.addNode('generateOutreach', generateOutreach)
.addNode('reviewOutreach', reviewOutreach, { ends: ['exportCsv'] })
.addNode('exportCsv', exportCsv)

// --- New idea path edges ---
.addEdge('understandIdea', 'generateIdeaCriteria')
.addEdge('generateIdeaCriteria', 'searchIdea')
.addEdge('searchIdea', 'extractTargets')
.addEdge('extractTargets', 'enrichTargets')
.addEdge('enrichTargets', 'evaluateIdeaTargets')
.addEdge('refineIdeaSearch', 'searchIdea')
.addEdge('generateOutreach', 'reviewOutreach')
.addEdge('exportCsv', 'saveMemory')  // reuses existing saveMemory -> END edge
```

---

## Implementation Order

### Phase 1: Foundation
- [x] `src/state.ts` — new schemas + fields + reducers
- [x] `src/config.ts` — idea path constants + API key configs

### Phase 2: Input + Understanding
- [x] `src/nodes/get-input.ts` — mode selection + idea routing
- [x] `src/nodes/understand-idea.ts`
- [x] `src/lib/prompts.ts` — `ideaUnderstandingPrompt`
- [x] `src/index.ts` — add understandIdea node + edge

### Phase 3: Search + Extraction
- [x] `src/lib/prompts.ts` — `ideaCriteriaPrompt`, `extractTargetsPrompt`
- [x] `src/nodes/generate-idea-criteria.ts`
- [x] `src/nodes/search-idea.ts`
- [x] `src/nodes/extract-targets.ts`
- [x] `src/index.ts` — add nodes + edges

### Phase 4: Enrichment
- [x] `src/lib/enrichment.ts` — Reddit OAuth + X API + URL verification
- [x] `src/nodes/enrich-targets.ts`
- [x] `src/index.ts` — add node + edge

### Phase 5: Evaluation + Review Loop
- [x] `src/lib/prompts.ts` — `evaluateIdeaTargetsPrompt`
- [x] `src/nodes/evaluate-idea-targets.ts`
- [x] `src/nodes/refine-idea-search.ts`
- [x] `src/nodes/ask-idea-help.ts`
- [x] `src/nodes/batch-review-targets.ts`
- [x] `src/index.ts` — add evaluation/review nodes + edges

### Phase 6: Outreach + Export
- [x] `src/lib/prompts.ts` — `outreachDraftPrompt`, `outreachRegenerationPrompt`
- [x] `src/nodes/generate-outreach.ts`
- [x] `src/nodes/review-outreach.ts`
- [x] `src/lib/csv-writer.ts`
- [x] `src/nodes/export-csv.ts`
- [x] `src/index.ts` — add final nodes + edges

### Phase 7: Memory + Docs
- [x] `src/nodes/save-memory.ts` — extend for idea mode
- [ ] End-to-end test with LangGraph Studio (`pnpm dev`)

---

## Verification Plan

1. **Typecheck:** `pnpm typecheck` after each phase — no regressions
2. **Business path regression:** Run existing business path end-to-end, confirm identical behavior
3. **Idea path smoke test:** Create test idea.md, run through Studio with mode=idea
4. **Enrichment test:** Verify API key validation throws clearly when keys are missing
5. **Batch review loop:** Test reject -> backfill -> re-present cycle (verify cycle cap at 5)
6. **CSV output:** Verify file is valid CSV, opens correctly in Excel/Sheets, newlines in outreach drafts are properly quoted
7. **Community extraction:** Verify LLM extracts real community URLs from web articles, dead URLs filtered by verification

---

## Key Constraints (from codebase patterns)

- Nodes with `{ ends }` MUST return `Command`, never `Partial<State>`
- All imports require `.js` extension (ESM)
- Package manager: `pnpm`
- Cap search queries to 5 max (content) + 3 max (community)
- Use `?? 0` for numeric state fields (checkpointer serialization gotcha)
- `better-sqlite3` needs `onlyBuiltDependencies` in package.json
- No new npm packages needed — use built-in `fetch` for API calls, manual CSV writing

---

## New Files Summary

| File | Purpose |
|------|---------|
| `src/nodes/understand-idea.ts` | Parse idea.md via LLM |
| `src/nodes/generate-idea-criteria.ts` | Content + community search queries |
| `src/nodes/search-idea.ts` | Dual search strategy |
| `src/nodes/extract-targets.ts` | LLM extracts people/communities |
| `src/nodes/enrich-targets.ts` | Reddit/X API enrichment |
| `src/nodes/evaluate-idea-targets.ts` | Audience match evaluation |
| `src/nodes/batch-review-targets.ts` | Batch interrupt + backfill loop |
| `src/nodes/generate-outreach.ts` | Context-aware outreach drafts |
| `src/nodes/review-outreach.ts` | Batch outreach review |
| `src/nodes/export-csv.ts` | CSV file output |
| `src/nodes/refine-idea-search.ts` | Idea-specific search refinement |
| `src/nodes/ask-idea-help.ts` | User help after max iterations |
| `src/lib/enrichment.ts` | Reddit/X API clients + URL check |
| `src/lib/csv-writer.ts` | RFC 4180 CSV serialization |
