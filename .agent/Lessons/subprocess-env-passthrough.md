# Lesson: Always pass full process.env to child processes

## Problem
`search-runner.ts` was spawning `last30days.py` with a restricted env object (only `PATH`, `HOME`, `PYTHONPATH`, `VIRTUAL_ENV`, `LANG`, `LC_ALL`). Inside LangGraph Studio's server process, this stripped out API keys that `last30days.py` needs (e.g., `XAI_API_KEY`, `BRAVE_API_KEY`). Reddit and X searches returned 0 results even though the script worked fine when run directly from the terminal.

## Root cause
LangGraph Studio loads the project's `.env` via `langgraph.json` `"env": ".env"` into `process.env`. But the restricted env object in `execFile` options dropped those keys before they reached the Python subprocess.

## Fix
```ts
// WRONG — strips API keys needed by Python script
env: {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  // ...only 6 vars
},

// RIGHT — passes everything including loaded .env vars
env: { ...process.env },
```

## Lesson
- Always use `{ ...process.env }` when spawning child processes unless you have a specific security reason to restrict the env.
- When search results are 0 but the script works in terminal, the first thing to check is env var passthrough.
- LangGraph Studio injects `.env` into `process.env` — don't filter it out.

## Related
- `.agent/SOP/subprocess-and-search.md` — Python subprocess patterns
- `.agent/Lessons/api-enrichment-resilience.md` — Graceful degradation for API failures
