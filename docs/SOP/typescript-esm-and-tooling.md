# SOP: TypeScript ESM, pnpm, and Tooling

## ESM module setup

This project uses ESM (`"type": "module"` in package.json). Key implications:

### Import extensions
All relative imports MUST use `.js` extension (even for .ts files):
```ts
// GOOD
import { CONFIG } from '../config.js';
import { llm } from '../lib/llm.js';

// BAD — will fail at runtime
import { CONFIG } from '../config';
import { llm } from '../lib/llm';
```

### Direct execution guard
```ts
if (import.meta.url === `file://${process.argv[1]}`) {
  // Only runs when file is executed directly
}
```

## pnpm specifics

### Binary not in PATH
On this system, `pnpm` binary is not directly in PATH. Use:
```bash
npx pnpm install
npx pnpm typecheck
npx pnpm tsx src/some-file.ts
```

### Native module builds (better-sqlite3)
pnpm v10 blocks native module build scripts by default. Add to `package.json`:
```json
"pnpm": {
  "onlyBuiltDependencies": ["better-sqlite3", "esbuild"]
}
```
Then rebuild: `npx pnpm rebuild better-sqlite3 esbuild`

### Running TypeScript with env vars
`tsx` does not auto-load `.env` files. Use Node's `--env-file` flag:
```bash
npx pnpm tsx --env-file=.env src/my-script.ts
```

## ESLint configuration

### Correct extends format
```json
"extends": [
  "eslint:recommended",
  "plugin:@typescript-eslint/recommended"
]
```
Note: `plugin:` prefix is required. Using just `"@typescript-eslint/recommended"` fails.

### Invalid rules
`@typescript-eslint/prefer-const` does not exist. Use the native ESLint `prefer-const` rule instead.

## TypeScript tips

### Interface vs Record for external data
TypeScript interfaces can't be assigned to `Record<string, unknown>` in strict mode. Use spread:
```ts
// BAD — TS error in strict mode
const data: Record<string, unknown> = someInterface;

// GOOD
const data: Record<string, unknown> = { ...someInterface };
```

### Runtime properties not in types
Some LangGraph properties (like `__interrupt__`) exist at runtime but not in TypeScript types:
```ts
// Use a permissive type for graph results
type GraphResult = Record<string, any>;
const result: GraphResult = await graph.invoke(input, config);
if (result.__interrupt__?.length > 0) { ... }
```

## LangGraph Studio

### Starting
```bash
npx pnpm dev
# or
npx pnpx @langchain/langgraph-cli dev
```

### Configuration
`langgraph.json` maps graph names to exports:
```json
{
  "graphs": {
    "distribution-agent": "src/distribution-agent/index.ts:graph"
  },
  "env": ".env"
}
```

### Hot reload
Studio watches for file changes and auto-restarts. You'll see:
```
[tsx] change in ./src/distribution-agent/nodes/evaluate.ts Restarting...
```

### Dependency version warnings
Studio may warn about `@langchain/langgraph-checkpoint` version mismatch. This is usually safe to ignore for development but should be resolved for production.
