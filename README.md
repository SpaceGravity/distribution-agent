# Distribution Agent

LangGraph-based product outreach automation agent. Understands your business, searches for relevant conversations, generates contextual replies, and manages outreach campaigns.

## Architecture

- **11 nodes** with Command-based routing
- **SqliteSaver** checkpointer for persistence
- **Human-in-the-loop** interrupts for review and approval

## Setup

```bash
pnpm install
cp .env.example .env  # Add your API keys
```

## Usage

```bash
# Run basic test
pnpm test

# Run full test suite (15 tests)
pnpm test:advanced

# Launch LangGraph Studio
pnpm dev
```

## Project Structure

```
src/              # Agent source code
  index.ts        # Graph definition and entry point
  state.ts        # State schema
  config.ts       # Configuration
  nodes/          # All graph nodes
  lib/            # Shared utilities (LLM, prompts, search)
  templates/      # Prompt templates
docs/             # Documentation, SOPs, and specs
```
