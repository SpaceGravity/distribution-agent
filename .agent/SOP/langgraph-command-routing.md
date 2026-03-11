# SOP: LangGraph Command Routing and Graph Edges

## Static vs Dynamic Routing

### Static edges — use `.addEdge()`
For nodes that always go to the same next node:
```ts
.addEdge('understandBusiness', 'generateCriteria')
.addEdge('generateCriteria', 'search')
.addEdge('saveMemory', END)
```

### Dynamic routing — use `Command` with `{ ends }`
For nodes that conditionally route to different nodes:
```ts
// In graph construction — declare possible destinations
.addNode('evaluate', evaluate, {
  ends: ['generateReplies', 'refineSearch', 'askUserHelp'],
})

// In the node function — return Command with goto
return new Command({
  update: { iterationCount: newIteration },
  goto: 'generateReplies',
});
```

## Critical Rule: Nodes with `{ ends }` MUST return Command

If a node is declared with `{ ends: [...] }`, it **must always** return a `Command` object — never a plain `Partial<State>`. The graph has no static edge from that node, so returning a plain object means the graph has nowhere to go and silently stops.

```ts
// BAD — graph stops after this node
export async function getInput(state: State): Promise<Partial<State>> {
  if (state.inputReady) {
    return { targetCount: 20 }; // No routing — graph halts
  }
  // ...
}

// GOOD — always returns Command
export async function getInput(state: State): Promise<Command> {
  if (state.inputReady) {
    return new Command({
      update: { targetCount: 20 },
      goto: 'understandBusiness',
    });
  }
  // ...
}
```

## Self-loops

A node can route back to itself (e.g., `reviewReply` → `reviewReply` for reject/regenerate):
```ts
.addNode('reviewReply', reviewReply, {
  ends: ['postReply', 'reviewReply', 'saveMemory'],
})
```

## Mode-based routing at entry point

For a single graph supporting multiple paths, use the entry node as a mode switch:
```ts
.addNode('getInput', getInput, {
  ends: ['understandBusiness', 'understandIdea'],
})

// In the node:
if (mode === 'idea') {
  return new Command({ update: { mode: 'idea' }, goto: 'understandIdea' });
}
return new Command({ update: { mode: 'business' }, goto: 'understandBusiness' });
```

The two paths are fully independent — they share no nodes except `getInput` (entry) and `saveMemory` (terminal). Both paths converge at `saveMemory → END` via static edges.

## Debugging routing issues

If the graph stops unexpectedly:
1. Check if the node is declared with `{ ends }` — if so, ensure it returns `Command` in ALL code paths
2. Check the `goto` target matches a declared `ends` value exactly (case-sensitive)
3. Look for any code path that returns `Partial<State>` instead of `Command`
