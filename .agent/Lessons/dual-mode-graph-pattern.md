# Lesson: Dual-mode graph via mode switch at entry node

## Pattern
When adding a second independent path to an existing graph, use a `mode` field in state and route at the entry node — don't create a second graph.

## Why this works
- Single graph = single checkpointer, single Studio instance, single deployment
- Both paths share `getInput` (entry) and `saveMemory` (terminal) — no duplication
- Adding `mode` as optional with no default preserves backward compatibility
- Each path's nodes are fully independent — no shared mutable state between paths

## Key implementation details

### 1. Entry node must declare all possible destinations
```ts
.addNode('getInput', getInput, {
  ends: ['understandBusiness', 'understandIdea'],  // both paths
})
```

### 2. Pre-populated state skip must check mode
```ts
// Check idea path first (more specific)
if (state.mode === 'idea' && state.ideaFilePath) {
  return new Command({ update: {}, goto: 'understandIdea' });
}
// Then business path
if (state.businessFilePath && state.selectedPlatforms.length > 0) {
  return new Command({ update: { mode: 'business' }, goto: 'understandBusiness' });
}
```

### 3. Shared terminal node must be mode-aware
`saveMemory` checks `state.mode` and populates mode-specific fields in the strategy record.

## Gotcha
If you forget to add the new path's entry node to the `ends` array of `getInput`, the graph will silently halt when mode=idea is selected.

## Related
- `.agent/SOP/langgraph-command-routing.md` — Mode-based routing section
- `.agent/SOP/agent-architecture-patterns.md` — Dual-mode graph section
