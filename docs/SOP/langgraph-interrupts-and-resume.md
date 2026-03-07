# SOP: LangGraph Interrupts and Human-in-the-Loop

## Basic Pattern

```ts
import { interrupt, Command } from '@langchain/langgraph';

export async function reviewNode(state: State): Promise<Command> {
  // Present data to user and pause
  const userResponse = interrupt({
    action: 'Review this item',
    data: { title: state.currentItem.title },
    options: 'approve | reject | skip',
  });

  // Code below runs AFTER user resumes
  if (userResponse.action === 'approve') {
    return new Command({ update: { ... }, goto: 'nextNode' });
  }
  // ...
}
```

## Resuming from interrupt

```ts
import { Command } from '@langchain/langgraph';

// Resume with user's response
const result = await graph.invoke(
  new Command({ resume: { action: 'approve' } }),
  { configurable: { thread_id: threadId } }
);
```

## Detecting interrupts in results

The graph result contains `__interrupt__` when paused:
```ts
type GraphResult = Record<string, any>;

const result: GraphResult = await graph.invoke(input, config);

if (result.__interrupt__?.length > 0) {
  const interruptData = result.__interrupt__[0];
  console.log(interruptData.value.action); // "Review this item"
}
```

Note: `__interrupt__` is a runtime property not in TypeScript types. Use `Record<string, any>` or explicit type assertion.

## Sequential one-by-one review pattern

For reviewing items one at a time (like reply drafts):

```ts
export async function reviewReply(state: State): Promise<Command> {
  const { items, currentIndex } = state;

  // Check if all done
  if (currentIndex >= items.length) {
    return new Command({ update: {}, goto: 'finish' });
  }

  // Present current item
  const response = interrupt({
    action: 'Review item',
    item: items[currentIndex],
    progress: `${currentIndex + 1} of ${items.length}`,
  });

  if (response.action === 'approve') {
    return new Command({
      update: { currentIndex: currentIndex + 1 },
      goto: 'postItem',
    });
  }

  if (response.action === 'reject') {
    // Regenerate and loop back to same index
    const newItem = await regenerate(items[currentIndex], response.feedback);
    return new Command({
      update: { items: [newItem] }, // goes through upsert reducer
      goto: 'reviewReply', // self-loop, same index
    });
  }

  // Skip
  return new Command({
    update: { currentIndex: currentIndex + 1 },
    goto: 'reviewReply',
  });
}
```

## SQLite checkpointer for persistence

Use `SqliteSaver` instead of `MemorySaver` for state that survives process restarts:

```ts
import { SqliteSaver } from '@langchain/langgraph-checkpoint-sqlite';

const checkpointer = SqliteSaver.fromConnString('./my-agent.sqlite');
const graph = new StateGraph(Schema)
  .addNode(...)
  .compile({ checkpointer });
```

Requires `@langchain/langgraph-checkpoint-sqlite` and `better-sqlite3` native module.

### pnpm native module setup
pnpm v10 blocks native module builds by default. Add to `package.json`:
```json
"pnpm": {
  "onlyBuiltDependencies": ["better-sqlite3", "esbuild"]
}
```
Then run `npx pnpm rebuild better-sqlite3`.

## Resume test pattern

To verify SQLite persistence works:
```ts
// 1. Get state mid-interrupt
const savedState = await graph.getState(config);
assert(savedState.values.someField !== undefined);

// 2. Resume from checkpoint
const result = await graph.invoke(
  new Command({ resume: { action: 'approve' } }),
  config
);
```
