# Lesson: Missing tsconfig.json breaks `pnpm typecheck`

## Problem
The project has `"typecheck": "tsc --noEmit"` in package.json scripts, but there is no `tsconfig.json` file at the project root. Running `pnpm typecheck` prints the tsc help text and exits with code 0 — silently succeeding without actually checking anything.

## Discovery
During the idea path implementation, `pnpm typecheck` appeared to pass but was doing nothing. Verification had to be done via `tsx` dynamic import instead:

```bash
npx tsx --env-file=.env -e "import('./src/index.ts').then(() => console.log('OK'))"
```

## Impact
Type errors can go undetected. The typecheck script gives false confidence.

## Fix Needed
Create a `tsconfig.json` at the project root. Minimum viable config for this ESM project:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

## Workaround
Until tsconfig is added, verify compilation via tsx:
```bash
npx tsx --env-file=.env -e "import('./src/index.ts').then(() => console.log('Graph compiled successfully'))"
```

## Related
- `.agent/SOP/typescript-esm-and-tooling.md`
