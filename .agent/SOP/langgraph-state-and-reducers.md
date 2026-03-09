# SOP: LangGraph State Schemas and Reducers

## State Definition Pattern

Define state with Zod v4 schemas using `register(registry, { ... })` for arrays and channels that need special merge semantics.

```ts
import z from 'zod';
import { registry } from '@langchain/langgraph/zod';

const StateSchema = z.object({
  // Simple fields — last-write-wins
  name: z.string().optional(),
  count: z.number().register(registry, { default: () => 0 }),

  // Arrays with reducers — custom merge logic
  items: z.array(ItemSchema).register(registry, {
    reducer: {
      fn: (left: Item[], right: Item[]) => left.concat(right),
    },
    default: () => [],
  }),
});
```

## Reducer Patterns

### Append (evaluationHistory, postedReplies)
```ts
reducer: { fn: (left, right) => left.concat(right) }
```

### Deduplicate by ID (searchResults)
```ts
reducer: {
  fn: (left, right) => {
    const map = new Map();
    for (const item of [...left, ...right]) {
      const existing = map.get(item.id);
      if (!existing || item.score > existing.score) {
        map.set(item.id, item);
      }
    }
    return Array.from(map.values());
  },
}
```

### Upsert by key (replyDrafts)
```ts
reducer: {
  fn: (left, right) => {
    const map = new Map();
    for (const d of left) map.set(d.targetId, d);
    for (const d of right) map.set(d.targetId, d);
    return Array.from(map.values());
  },
}
```

## Gotchas

### Default values may not apply at runtime
Even with `register(registry, { default: () => 0 })`, the state value can be `undefined` at runtime (especially after checkpointer deserialization). Always use fallbacks:
```ts
// BAD — produces NaN if iterationCount is undefined
const next = state.iterationCount + 1;

// GOOD
const next = (state.iterationCount ?? 0) + 1;
```

### Type inference
Use `z.infer<typeof Schema>` for TypeScript types. Export both the schema and the inferred type:
```ts
export const MySchema = z.object({ ... });
export type MyState = z.infer<typeof MySchema>;
```

### Append for feedback/history arrays (targetRejectionNotes, evaluationHistory)
```ts
targetRejectionNotes: z.array(TargetRejectionNoteSchema).register(registry, {
  reducer: { fn: (left, right) => left.concat(right) },
  default: () => [],
}),
```
These accumulate across the session and are injected into prompts as context.

### Command updates go through reducers
When a node returns `new Command({ update: { items: [newItem] } })`, the `items` array goes through the reducer — it does NOT replace the array. This is by design. If the reducer is `concat`, it appends. If it's dedup, it merges.
