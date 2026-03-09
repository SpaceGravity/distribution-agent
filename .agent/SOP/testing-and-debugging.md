# SOP: Testing and Debugging LangGraph Agents

## Integration test structure

### Basic E2E test (test-run.ts)
Pre-populate state to skip interactive interrupts, auto-approve all reviews:
```ts
// Skip getInput interrupt by providing state upfront
let result = await graph.invoke({
  businessFilePath: '/path/to/business.md',
  selectedPlatforms: ['reddit', 'x'],
  targetCount: 5,
}, config);

// Loop through interrupts
while (result.__interrupt__?.length > 0) {
  const action = result.__interrupt__[0].value?.action;

  if (action.includes('Review this reply')) {
    result = await graph.invoke(
      new Command({ resume: { action: 'approve' } }),
      config
    );
  }
  // handle other interrupt types...
}
```

### Advanced test (test-advanced.ts)
Test specific flows in a single run to avoid repeating the slow search phase:
1. Run full pipeline to first review interrupt
2. REJECT first draft with feedback → verify regeneration
3. Check SQLite state persistence via `graph.getState(config)`
4. APPROVE regenerated draft → verify resume works
5. Auto-approve remaining
6. Assert final state (iterationCount, postedReplies, etc.)

### Assertion pattern
```ts
const tests: { name: string; passed: boolean; detail: string }[] = [];

function assert(name: string, condition: boolean, detail: string) {
  tests.push({ name, passed: condition, detail });
  console.log(condition ? `  PASS: ${name}` : `  FAIL: ${name} -- ${detail}`);
}
```

### Testing reject_target
To test target rejection in the advanced test:
```ts
// Send reject_target during review interrupt
result = await graph.invoke(
  new Command({
    resume: {
      action: 'reject_target',
      reason: 'this post is about personal finance, not cloud costs',
    },
  }),
  config
);

// Verify rejection was recorded
const state = await graph.getState(config);
assert(state.values.targetRejectionNotes.length > 0);
assert(state.values.targetRejectionNotes[0].reason.includes('personal finance'));
```

### Testing backward compatibility
Bare `reject` (without `_reply` suffix) must still work:
```ts
result = await graph.invoke(
  new Command({ resume: 'reject: too generic' }),
  config
);
// Should regenerate the reply, not crash
```

## Common bugs and fixes

### Graph stops silently after a node
**Cause**: Node declared with `{ ends: [...] }` returns `Partial<State>` instead of `Command`.
**Fix**: Always return `Command` from nodes with dynamic routing. See `langgraph-command-routing.md`.

### iterationCount is NaN
**Cause**: `state.iterationCount` is `undefined` (registry default not applied), and `undefined + 1 = NaN`.
**Fix**: Use `(state.iterationCount ?? 0) + 1`.

### LLM generates too many search queries
**Cause**: Without explicit limits, Claude generates 10-20 queries.
**Fix**: (1) Add "at most 5 queries" to prompt, (2) Cap in code: `queries.slice(0, 5)`.

### Irrelevant results make it through evaluation
**Cause**: Keyword-based search returns topically similar but irrelevant posts.
**Fix**: (1) Add strict relevance criteria to evaluation prompt, (2) Have evaluate return `topResultIds`, (3) Filter in evaluate node before passing to generateReplies.

### SQLite checkpointer fails to build
**Cause**: pnpm v10 blocks native module build scripts.
**Fix**: Add `"pnpm": { "onlyBuiltDependencies": ["better-sqlite3", "esbuild"] }` to package.json, then `npx pnpm rebuild better-sqlite3`.

### tsx doesn't load .env
**Cause**: `tsx` does not auto-load environment files.
**Fix**: Use `npx pnpm tsx --env-file=.env src/my-script.ts`.

## Debugging tips

### Console logging in nodes
Each node should log its name and key metrics:
```ts
console.log(`[evaluate] Iteration ${n}/${MAX}, evaluating ${results.length} results`);
console.log(`[evaluate] Decision: ${decision.satisfactory ? 'SATISFACTORY' : 'NOT SATISFACTORY'}`);
```

### Checking state mid-run
Use `graph.getState(config)` to inspect the current checkpoint:
```ts
const state = await graph.getState(config);
console.log(state.values);
```

### Running in background
For long-running tests (search takes 5-15 min), use background execution:
```bash
npx pnpm tsx --env-file=.env src/distribution-agent/test-advanced.ts &
```

### Clean SQLite between test runs
Delete the SQLite file to start fresh:
```bash
rm -f distribution-agent.sqlite
```
