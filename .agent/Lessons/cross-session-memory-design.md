# Cross-Session Memory Design Patterns

## Memory is External to LangGraph State

Cross-session memory lives in JSON files at `~/.distribution-agent/memory/`, NOT in the LangGraph state schema. This avoids bloating the checkpointer and keeps memory independent of thread lifecycle.

- No new state fields or reducers were added
- Memory reads happen lazily in reader nodes (not at session start)
- Memory writes happen in `saveMemory` at session end
- Each node loads ONLY the memory file it needs

## Injection Threshold: Strength >= 2

A pattern seen once could be noise. Seen twice across independent sessions = real signal. Only patterns with `strength >= 2` are injected into prompts via `<cross_session_rejection_patterns>` XML blocks. This prevents over-fitting to a single session's rejections.

## LLM-Based Semantic Classification

Rejection patterns are classified using a single LLM call at save time (~500 tokens). The LLM matches new rejections against existing patterns semantically — so "personal finance post" and "unrelated money management content" are grouped into the same pattern even though they share no keywords. If the LLM call fails, the system falls back to creating each rejection as an individual pattern with strength 1. This keeps memory resilient — classification failures never block the graph.

**Why LLM over keyword matching:** The original approach used keyword overlap (3+ shared words = match). This failed when users expressed the same concern with different words, leading to redundant patterns that should have been grouped.

## Atomic Writes Prevent Corruption

Memory files use a `.tmp` + `renameSync` atomic write pattern. This prevents partial writes from corrupting the file if the process crashes mid-write. The `saveMemory` node wraps all persistence in try/catch — memory failures never block graph completion.

## Lazy Decay During Reads

Pattern decay happens lazily during reads, not via a background job. When `loadCrossSessionMemory()` is called, patterns not seen in 90 days get their strength decremented. Patterns at strength 0 are removed. This keeps the system simple with no cron jobs or cleanup scripts.

## Related Documentation

- `.agent/System/architecture.md` — Persistence section details all 4 memory files
- `.agent/SOP/llm-structured-output-and-prompts.md` — How memory is injected into prompts as XML blocks
- `.agent/Lessons/no-new-dependencies.md` — Why we use `fs.readFileSync`/`writeFileSync` instead of a database
