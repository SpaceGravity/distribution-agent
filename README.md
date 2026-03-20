# Distribution Agent

LangGraph-based automation agent with two modes: **product outreach** (business path) and **idea validation** (idea path). Both share a single graph with a mode switch at `getInput`.

## Architecture

- **23 nodes** with Command-based routing (2 shared + 9 business + 12 idea)
- **SqliteSaver** checkpointer for persistence
- **Human-in-the-loop** interrupts for review and approval (6 interrupt points)
- **Dual-mode graph** — business outreach or idea validation via mode selection
- **API enrichment** — Reddit (public endpoint) / X API for follower counts (idea path)
- **CSV export** — RFC 4180 compliant target export (idea path)

## Setup

```bash
pnpm install
cp .env.example .env  # Add your API keys
```

### Required Env Vars

| Var | Both Modes | Business Only | Idea (Optional) |
|-----|:----------:|:-------------:|:---------------:|
| `ANTHROPIC_API_KEY` | x | | |
| `X_BEARER_TOKEN` | | | x (enrichment) |

> **Note:** Reddit enrichment uses a public endpoint (no API keys needed). X enrichment requires a bearer token — if missing, X follower counts are skipped but target discovery still works.

## Usage

```bash
# Launch LangGraph Studio
pnpm dev

# Run basic test
pnpm test

# Run full test suite
pnpm test:advanced

# Type check
pnpm typecheck
```

## Two Modes

### Business Mode (Product Outreach)
Input: `business.md` file describing your product
Output: Posted replies to relevant social media conversations

### Idea Mode (Idea Validation)
Input: `idea.md` file with a problem hypothesis
Output: CSV of people/communities to reach out to for validation

## Business Path Review Actions

| Action | What it does |
|--------|-------------|
| **approve** | Post the reply |
| **edit** | Provide edited text, then post |
| **reject_reply** | Regenerate with feedback (same target) |
| **reject_target** | Skip target entirely + record why (influences future searches) |
| **skip** | Move to next without posting |

## Idea Path Review Actions

### Target Review (`batchReviewTargets`)
All discovered targets presented at once:
- `{ "approved": true }` — approve all targets
- `{ "rejections": [{ "id": "...", "reason": "..." }] }` — reject specific targets (triggers backfill search)

### Outreach Review (`reviewOutreach`)
All outreach drafts presented at once:
- `{ "approved": true }` — approve all drafts
- `{ "edits": [{ "id": "...", "feedback": "..." }], "rejections": ["id1"] }` — edit or reject specific drafts

## Project Structure

```
src/
  index.ts        # Graph definition and entry point (23 nodes)
  state.ts        # State schema with reducers
  config.ts       # Configuration
  nodes/          # All graph nodes (23 files)
  lib/            # Shared utilities (LLM, prompts, search, enrichment, CSV)
docs/             # Specs and examples
.agent/           # System docs, SOPs, tasks, lessons
```

## Graph Flow

### Business Path
```
START -> getInput -> understandBusiness -> generateCriteria -> search -> evaluate
                                                               ^           |
                                                               |    [satisfactory?]
                                                               |     /     |       \
                                                               |   yes   no(<5)   no(>=5)
                                                               |   /       |         \
                                                      generateReplies  refineSearch  askUserHelp
                                                               |
                                                         reviewReply (one-by-one)
                                                               |
                                                          postReply
                                                               |
                                                          saveMemory -> END
```

### Idea Path
```
START -> getInput -> understandIdea -> generateIdeaCriteria -> searchIdea -> extractTargets -> enrichTargets -> evaluateIdeaTargets
                                              ^                                                                        |
                                              |                                                                 [satisfactory?]
                                              |                                                                /      |        \
                                              |                                                              yes   no(<5)   no(>=5)
                                              |                                                              /       |          \
                                              |                                                 batchReviewTargets  refineIdeaSearch  askIdeaHelp
                                              |                                                      |
                                              |                                                [rejections?]
                                              |                                                /          \
                                              +-----------(backfill)----------yes               no
                                                                                               |
                                                                                        generateOutreach -> reviewOutreach -> exportCsv -> saveMemory -> END
```

## Documentation Index

| File | Description |
|------|-------------|
| `README.md` | This file — project overview and documentation index |
| `.agent/System/architecture.md` | Full system docs: dual-mode architecture, tech stack, integrations, config, persistence |
| `.agent/Tasks/idea-path-implementation.md` | Idea path feature spec — schemas, nodes, prompts, graph topology |
| `.agent/Tasks/implementation-plan.md` | Original 16-task business path implementation roadmap (complete) |
| `.agent/SOP/agent-architecture-patterns.md` | Graph design, node signatures, review patterns, enrichment, CSV export |
| `.agent/SOP/langgraph-command-routing.md` | Static vs dynamic edges, Command pattern, self-loops |
| `.agent/SOP/langgraph-interrupts-and-resume.md` | `interrupt()`, resume, SQLite persistence, sequential + batch review |
| `.agent/SOP/langgraph-state-and-reducers.md` | State schemas, reducer patterns, defaults gotchas |
| `.agent/SOP/llm-structured-output-and-prompts.md` | `withStructuredOutput`, prompt templates, rejection context, outreach tone |
| `.agent/SOP/subprocess-and-search.md` | Python subprocess, last30days integration, query capping |
| `.agent/SOP/testing-and-debugging.md` | Test patterns, common bugs, debugging tips |
| `.agent/SOP/typescript-esm-and-tooling.md` | ESM imports, pnpm, tsx, ESLint, LangGraph Studio |
| `.agent/SOP/langgraph-studio-operations.md` | Running the agent in Studio: input, interrupts, resume, output verification |
| `.agent/Lessons/missing-tsconfig.md` | `pnpm typecheck` silently does nothing — no tsconfig.json exists |
| `.agent/Lessons/dual-mode-graph-pattern.md` | How to add a second path to an existing graph via mode switch |
| `.agent/Lessons/batch-vs-sequential-review.md` | When to use batch review vs one-by-one review |
| `.agent/Lessons/api-enrichment-resilience.md` | Prefer zero-auth public endpoints; soft-warn on missing keys, fail soft on individual calls |
| `.agent/Lessons/no-new-dependencies.md` | Prefer built-in Node.js APIs (fetch, manual CSV) over npm packages |
| `.agent/Lessons/prompt-parameter-alignment.md` | Prompt functions must accept all data their callers pass |
| `.agent/Lessons/sentinel-value-filtering.md` | Sentinel strings are truthy — filter them explicitly |
| `.agent/Lessons/browser-automation-studio.md` | Browser automation lessons: JS scroll/click, Polly icon, extension disconnects |

### Skills

| Skill | Location | Trigger |
|-------|----------|---------|
| `langgraph-studio-runner` | `~/.claude/skills/langgraph-studio-runner/SKILL.md` | "run in studio", "run idea path", "run business path" |

### Related Documentation

- `CLAUDE.md` — Claude Code instructions and workflow rules
- `docs/The_agent_specs.md` — Full requirements specification
- `docs/tone_examples.md` — Platform-specific tone and reply examples
- `docs/business.md` — Sample business description
- `docs/features.md` — Feature list
