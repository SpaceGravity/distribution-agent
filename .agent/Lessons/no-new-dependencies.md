# Lesson: Prefer built-in Node.js APIs over new dependencies

## Context
The idea path needed HTTP API clients (Reddit, X) and CSV file writing. Both could have been solved with npm packages (`axios`, `csv-writer`, etc.).

## Decision: Zero new dependencies

### HTTP calls → built-in `fetch` (Node 20+)
```ts
const response = await fetch(url, {
  method: 'POST',
  headers: { Authorization: `Basic ${token}` },
  signal: AbortSignal.timeout(10_000),
});
```
- No `axios`, `node-fetch`, or `got` needed
- `AbortSignal.timeout()` handles timeouts natively
- Project already requires Node >=20

### CSV writing → manual RFC 4180
```ts
function escapeCsvField(value: string | number | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
```
- RFC 4180 is simple enough — ~20 lines of code
- No `csv-writer`, `papaparse`, or `fast-csv` needed
- Handles the tricky case: outreach drafts with newlines inside CSV cells

## Why this matters
- Fewer dependencies = fewer `pnpm install` issues, smaller attack surface
- `better-sqlite3` already requires `onlyBuiltDependencies` in pnpm — adding more native modules compounds the problem
- This project runs on `tsx` in development — extra dependencies slow startup

## Rule of thumb
If the implementation is <50 lines and the behavior is well-defined (like RFC 4180), write it yourself. If it's complex or has edge cases you'd miss (like full OAuth2 with PKCE), use a library.

## Related
- `.agent/SOP/typescript-esm-and-tooling.md`
