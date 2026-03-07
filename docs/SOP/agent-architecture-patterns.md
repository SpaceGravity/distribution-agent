# SOP: Distribution Agent Architecture Patterns

## Graph flow design

### Linear backbone with conditional branches
The main flow is linear (getInput -> understandBusiness -> generateCriteria -> search -> evaluate). Branch points use `Command` routing:

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
src/distribution-agent/
  index.ts           # Graph construction only
  state.ts           # All Zod schemas
  config.ts          # Env-based constants
  nodes/             # One file per node
    get-input.ts
    evaluate.ts
    ...
  lib/               # Shared utilities
    llm.ts           # ChatAnthropic instance
    prompts.ts       # All prompt templates
    search-runner.ts # Subprocess wrapper
  templates/         # User-facing templates
  test-run.ts        # Basic E2E test
  test-advanced.ts   # Comprehensive test suite
```

### Separation of concerns
- **state.ts**: Only schemas and types. No logic.
- **config.ts**: Only env vars and constants. No logic.
- **lib/prompts.ts**: Only prompt template functions. No LLM calls.
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
