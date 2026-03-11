# SOP: Distribution Agent Architecture Patterns

## Graph flow design

### Dual-mode graph with shared entry point
The graph supports two independent paths via a `mode` field. `getInput` routes to either `understandBusiness` (business mode) or `understandIdea` (idea mode). Both paths share `saveMemory` as their terminal node.

```
START -> getInput -> [mode?]
                       ├── business → linear business path → saveMemory → END
                       └── idea     → linear idea path     → saveMemory → END
```

### Linear backbone with conditional branches
Each path has a linear backbone with branch points using `Command` routing:

```
START -> linear nodes -> branch point
                              |
                    +---------+---------+
                    |         |         |
                  path A    path B    path C
                    |         |         |
                    +--> rejoin point <--+
```

Use `.addEdge()` for the linear backbone, `Command` with `{ ends }` for branches.

### Iterative refinement loop
For evaluate -> refine -> search -> evaluate cycles:
1. Track `iterationCount` in state (with `?? 0` fallback)
2. Set a max iteration limit (5)
3. On max iterations, interrupt for user guidance instead of looping forever
4. Reset iteration count after user provides guidance

### One-by-one sequential review
For reviewing items (reply drafts) one at a time:
1. Store `currentReviewIndex` in state
2. The review node checks `index >= items.length` → done
3. On approve: increment index, route to post
4. On reject: regenerate at same index, self-loop
5. On skip: increment index, self-loop
6. Post node increments index, routes back to review

## Node function signatures

### Simple node (returns partial state)
```ts
export async function myNode(
  state: DistributionState
): Promise<Partial<DistributionState>> {
  return { someField: newValue };
}
```

### Routing node (returns Command)
```ts
export async function myNode(
  state: DistributionState
): Promise<Command> {
  if (condition) {
    return new Command({
      update: { field: value },
      goto: 'nodeA',
    });
  }
  return new Command({
    update: { field: otherValue },
    goto: 'nodeB',
  });
}
```

### Interrupt node (returns Command after resume)
```ts
export async function myNode(
  state: DistributionState
): Promise<Command> {
  const response = interrupt({
    action: 'Description of what user should do',
    data: { ... },
  });

  // This code runs after user resumes
  return new Command({
    update: { userInput: response },
    goto: 'nextNode',
  });
}
```

## File organization

```
src/
  index.ts           # Graph construction only (23 nodes)
  state.ts           # All Zod schemas (business + idea)
  config.ts          # Env-based constants
  nodes/             # One file per node (23 files)
    get-input.ts     # Shared entry: mode selection
    ...business...   # 10 business-specific nodes
    ...idea...       # 12 idea-specific nodes
    save-memory.ts   # Shared: mode-aware strategy persistence
  lib/               # Shared utilities
    llm.ts           # ChatAnthropic instance
    prompts.ts       # 11 prompt template functions
    search-runner.ts # Subprocess wrapper
    enrichment.ts    # Reddit/X API clients + URL check
    csv-writer.ts    # RFC 4180 CSV serialization
  test-run.ts        # Basic E2E test
  test-advanced.ts   # Comprehensive test suite
```

### Separation of concerns
- **state.ts**: Only schemas and types. No logic.
- **config.ts**: Only env vars and constants. No logic.
- **lib/prompts.ts**: Only prompt template functions. No LLM calls.
- **lib/enrichment.ts**: Only API client functions. No graph logic.
- **lib/csv-writer.ts**: Only CSV serialization. No graph logic.
- **nodes/**: Each file is one node function. Imports from lib/.
- **index.ts**: Only graph construction. Imports nodes.

## Evaluation filtering pattern

To prevent irrelevant search results from becoming reply targets:

1. **Evaluate node**: Ask LLM to return `topResultIds` of only relevant results
2. **Store in state**: Put filtered results in `approvedTargets`
3. **GenerateReplies**: Use `approvedTargets` (if available) instead of raw `searchResults`

```ts
// In evaluate node (on satisfactory)
const approvedIds = new Set(decision.topResultIds ?? []);
const filteredResults = approvedIds.size > 0
  ? state.searchResults.filter((r) => approvedIds.has(r.id))
  : topResults; // fallback

return new Command({
  update: { approvedTargets: filteredResults },
  goto: 'generateReplies',
});

// In generateReplies node
const pool = state.approvedTargets.length > 0
  ? state.approvedTargets
  : state.searchResults;
```

## Target rejection feedback loop

When users reject a target post (not just the reply), the rejection reason feeds back into the search pipeline:

```
User rejects target → TargetRejectionNote stored in state
                          ↓
                    criteriaGenerationPrompt() includes <target_rejection_history>
                          ↓
                    evaluationPrompt() includes <rejected_targets>
                          ↓
                    save-memory.ts persists as targetRejectionPatterns
```

Key design decisions:
- Rejection notes use append reducer (accumulate, never overwrite)
- Notes are injected as XML blocks into prompts (not embedded in system instructions)
- The `reject_target` action marks the draft as `skipped` (reuses existing status enum)
- Backward compat: bare `reject` still works as `reject_reply`

## Memory / strategy persistence

For cross-session learning, save winning strategies to disk:
```ts
const MEMORY_FILE = resolve(HOME, '.distribution-agent/search-strategies.json');

// Append new strategy, keep last 50
strategies.push(record);
if (strategies.length > 50) strategies = strategies.slice(-50);
writeFileSync(MEMORY_FILE, JSON.stringify(strategies, null, 2));
```

This is a simple alternative to LangGraph Store when you don't need cloud persistence.

## Batch review with backfill pattern (idea path)

For reviewing all items at once with the ability to reject and re-search:

```
batchReviewTargets ← (backfill) ← generateIdeaCriteria ← ...search/extract loop...
        |
  [rejections?]
  /          \
yes           no → generateOutreach
  |
  → remove rejected, record IdeaRejectionNote
  → increment ideaReviewCycle
  → goto generateIdeaCriteria (re-search to fill gaps)
```

Key design decisions:
- Review cycle capped at `IDEA_MAX_REVIEW_CYCLES` (5) — force-proceeds after that
- Rejected targets are completely removed (not marked skipped)
- Rejection notes feed back into search criteria + evaluation prompts
- Different from business path's one-by-one review — all targets shown at once

## Dual search strategy (idea path)

The idea path runs two types of searches in parallel:
1. **Content queries** (max 5): Run on user-selected platforms to find people discussing the pain point
2. **Community-discovery queries** (max 3): Run on `web` only to find relevant communities (subreddits, forums, Discord servers)

Both result sets merge into `searchResults` via the existing dedup reducer.

## External API enrichment pattern

For enriching targets with external data (follower counts):

```ts
// 1. Check API keys — soft-warn if missing, skip those platforms
const hasRedditKeys = !!CONFIG.REDDIT_CLIENT_ID && !!CONFIG.REDDIT_CLIENT_SECRET;
const hasXKey = !!CONFIG.X_BEARER_TOKEN;
if (!hasRedditKeys) console.warn('Reddit keys missing — skipping Reddit enrichment');

// 2. Get auth tokens once (only if keys present and targets exist)
let redditToken: string | null = null;
if (hasRedditKeys && hasRedditTargets) {
  try { redditToken = await getRedditAccessToken(...); }
  catch (err) { console.warn(`Reddit OAuth failed: ${err}`); }
}

// 3. Process in batches with concurrency limit, passing key flags
for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY);
  await Promise.allSettled(batch.map(t => enrichSingle(t, redditToken, hasXKey)));
}

// 4. Run follower lookup + URL verification in parallel per target
const [followerCount, isAlive] = await Promise.all([followerPromise, urlPromise]);

// 5. Individual failures → log warning, set null, continue
```

Key principles:
- **Soft-warn on missing API keys** — enrichment is optional, never blocks pipeline
- Individual failures never block the pipeline
- Concurrency-limited to avoid rate limits
- Parallelize follower lookup + URL verification within each target

## CSV export pattern

For RFC 4180 compliant CSV output:

```ts
// Escape fields containing commas, quotes, or newlines
function escapeCsvField(value: string | number | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```

- Create output directory with `mkdirSync({ recursive: true })`
- Filename includes timestamp for uniqueness
- No external CSV library needed
