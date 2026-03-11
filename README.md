# Distribution Agent

LangGraph-based automation agent with two modes: **product outreach** (business path) and **idea validation** (idea path).

## Quick Start

```bash
pnpm install
cp .env.example .env  # Add your API keys
pnpm dev              # Launch LangGraph Studio
```

## Two Modes

| Mode | Input | Output |
|------|-------|--------|
| **Business** | `business.md` (product description) | Posted replies to relevant conversations |
| **Idea** | `idea.md` (problem hypothesis) | CSV of people/communities for validation outreach |

## Documentation

All detailed documentation lives in `.agent/`. Start here:

| Document | What You'll Find |
|----------|-----------------|
| [`.agent/README.md`](.agent/README.md) | Full documentation index, setup, usage, review actions |
| [`.agent/System/architecture.md`](.agent/System/architecture.md) | Architecture, tech stack, integrations, config, persistence |
| [`.agent/Tasks/idea-path-implementation.md`](.agent/Tasks/idea-path-implementation.md) | Idea path feature spec — schemas, nodes, prompts, graph topology |

### SOPs (How-To Guides)

| SOP | Topic |
|-----|-------|
| [`agent-architecture-patterns`](.agent/SOP/agent-architecture-patterns.md) | Graph design, node signatures, review patterns, enrichment, CSV |
| [`langgraph-command-routing`](.agent/SOP/langgraph-command-routing.md) | Static vs dynamic edges, Command pattern, mode-based routing |
| [`langgraph-interrupts-and-resume`](.agent/SOP/langgraph-interrupts-and-resume.md) | Interrupts, resume, sequential + batch review patterns |
| [`langgraph-state-and-reducers`](.agent/SOP/langgraph-state-and-reducers.md) | State schemas, reducer patterns, gotchas |
| [`llm-structured-output-and-prompts`](.agent/SOP/llm-structured-output-and-prompts.md) | Structured output, prompt templates, outreach tone |
| [`subprocess-and-search`](.agent/SOP/subprocess-and-search.md) | Python subprocess, last30days integration |
| [`testing-and-debugging`](.agent/SOP/testing-and-debugging.md) | Test patterns, common bugs |
| [`typescript-esm-and-tooling`](.agent/SOP/typescript-esm-and-tooling.md) | ESM imports, pnpm, tsx, LangGraph Studio |

### Other

| File | Description |
|------|-------------|
| [`docs/The_agent_specs.md`](docs/The_agent_specs.md) | Full requirements specification |
| [`docs/tone_examples.md`](docs/tone_examples.md) | Platform-specific tone and reply examples |
| [`docs/business.md`](docs/business.md) | Sample business description |
| [`CLAUDE.md`](CLAUDE.md) | Claude Code workflow rules |

### Lessons Learned

| File | Topic |
|------|-------|
| [`missing-tsconfig`](.agent/Lessons/missing-tsconfig.md) | `pnpm typecheck` silently does nothing — no tsconfig.json |
| [`dual-mode-graph-pattern`](.agent/Lessons/dual-mode-graph-pattern.md) | Adding a second path to an existing graph via mode switch |
| [`batch-vs-sequential-review`](.agent/Lessons/batch-vs-sequential-review.md) | When to use batch review vs one-by-one review |
| [`api-enrichment-resilience`](.agent/Lessons/api-enrichment-resilience.md) | Soft-warn on missing API keys, fail soft on individual calls |
| [`no-new-dependencies`](.agent/Lessons/no-new-dependencies.md) | Prefer built-in Node.js APIs over npm packages |
| [`prompt-parameter-alignment`](.agent/Lessons/prompt-parameter-alignment.md) | Prompt functions must accept all data their callers pass |
| [`sentinel-value-filtering`](.agent/Lessons/sentinel-value-filtering.md) | Sentinel strings are truthy — filter them explicitly |
