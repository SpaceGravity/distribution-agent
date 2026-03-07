## Distribution Agent

## Runs locally on laptop -- no web deployment needed.


## Overall

This is a generic distribution agent for product outreach. It reads a user-provided business description (.md file), searches for potential customers across platforms, evaluates results through an iterative refinement loop, generates human-sounding reply drafts, and presents them one-by-one for user approval before posting. Built with LangGraph (TypeScript) following the L1/L2 patterns in this monorepo.


## Workflow

### Core idea

This agent automates product distribution outreach. It searches Reddit, X, YouTube, TikTok, Instagram, Hacker News, and websites for targeted customers, then generates and posts contextual replies proposing the product.

### How it works

Using LangGraph, the agent follows this sequence:

1. **Start** -- Collect user input via interrupt:
   - Path to business description `.md` file (user specifies at runtime)
   - Platform selection (reddit, x, youtube, tiktok, instagram, hn, web)
   - Target count (default: 20, aiming for 15-25 targets per run)
   - Optional tone examples file path

2. **Understand Business** -- A dedicated node reads the .md file and uses Claude (Anthropic) with structured output to generate a `BusinessUnderstanding` object: summary, target audience, value proposition, key features, and seed search criteria. This is stored in state and used by all downstream nodes.

3. **Generate Search Criteria** -- Claude generates structured search criteria (keywords, queries, platform filters, depth) from the business understanding.

4. **Search** -- Call the `last30days` Python skill via subprocess (`child_process.execFile`). The skill searches across selected platforms and returns scored, deduplicated results as JSON. A standalone MCP server wrapper for last30days also exists at `~/.claude/mcp-servers/last30days-mcp/` for external reuse.

5. **Evaluate + Refine Loop** (max 5 iterations) -- Claude re-evaluates the search results for product-market fit (not just trusting last30days’ general scores). Full iteration history is kept in state so the LLM can learn from prior attempts.
   - **Satisfactory**: Proceed to step 6.
   - **Not satisfactory (iterations < 5)**: Claude refines search criteria based on evaluation history, loops back to Search.
   - **Not satisfactory (iterations >= 5)**: Soft pause via `interrupt()`. Present all 5 iteration reports to the user and ask for guidance. User provides new strategy, iteration count resets, loop resumes.
   - **Memory**: After successful search, save the winning strategy to LangGraph Store (cross-session persistent memory) for future reference.

6. **Generate Replies** -- For each of the top N targets (sorted by score), Claude generates a reply draft:
   - Directly relevant to the original post content.
   - Friendly and enthusiastic.
   - No emojis.
   - Maximum 4 sentences (LLM decides how many).
   - Human founder tone -- must not feel AI-generated.
   - Explains how the product could help them.
   - Uses tone_examples.md (3-5 real replies) as few-shot examples.
   - Batched with concurrency limit of 5.

7. **Review + Post** (one-by-one sequential) -- For each draft, `interrupt()` pauses to show the user:
   - Original post (title, text, URL, platform)
   - Proposed reply draft
   - Options: **approve** | **edit** | **reject** | **skip**
   - On **reject**: user provides feedback, Claude regenerates the reply, presents again. Repeats until approve or explicit skip.
   - On **approve/edit**: If `AUTO_POST_ENABLED=true` (config flag, currently off -- no write tokens yet), post via platform API. Otherwise, log reply text for clipboard copy + open target URL for manual posting.

8. **Save Memory + End** -- Persist winning search strategy to LangGraph Store. Log run summary.

### Persistence and Resumability

- **Checkpointer**: SQLite-based (`@langchain/langgraph-checkpoint-sqlite`) for full resume across process restarts.
- **Runtime**: LangGraph Studio (`pnpm dev`) + direct CLI execution (`pnpm tsx`).
- **Memory**: LangGraph Store for cross-session persistent search strategies.

### Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| LLM | Claude (Anthropic) | Strong at nuanced writing, tone matching, complex instructions |
| Search | last30days via subprocess | Already searches 7+ platforms with scoring, dedup, caching |
| MCP server | Standalone at ~/.claude/mcp-servers/ | Reusable by any project |
| Checkpointer | SQLite | Survives process restarts for full resumability |
| Memory | LangGraph Store | Cross-session persistent search strategies |
| Auto-posting | Config flag (off) | No write tokens yet; clipboard + link fallback |
| Review UX | One-by-one sequential | Maximum user control per reply |
| Reject flow | Regenerate with feedback | Keeps trying until user approves or skips |
| Safety filter | None (user decides) | User reviews every reply individually |


## Constraints

- The code should follow best practices, and add comments for major code blocks.
- Arrange the code as a senior engineer would: all state together, all nodes together, and all edges together to be more readable.
- Security is critical; after finishing each task, would a senior security engineer accept that?
- Split the plan into small related tasks, with each task launching a subagent to write the code and test it.
- All LLM calls use Claude via `@langchain/anthropic` with `llm.withStructuredOutput()` where applicable.
- State arrays use Zod `register(registry, { reducer })` pattern for proper merge semantics.
- File path validation: absolute paths only, .md extension, < 50KB, no path traversal.
- No secrets in code -- all API keys from `.env`.
