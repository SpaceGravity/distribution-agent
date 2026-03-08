# Distribution Agent

LangGraph-based product outreach automation agent. Understands your business, searches for relevant conversations, generates contextual replies, and manages outreach campaigns.

## Architecture

- **11 nodes** with Command-based routing
- **SqliteSaver** checkpointer for persistence
- **Human-in-the-loop** interrupts for review and approval
- **Target rejection feedback** — reject unsuitable targets with reasons that refine future searches

## Setup

```bash
pnpm install
cp .env.example .env  # Add your API keys
```

## Usage

```bash
# Run basic test
pnpm test

# Run full test suite
pnpm test:advanced

# Launch LangGraph Studio
pnpm dev

# Type check
pnpm typecheck
```

## Review Actions

During reply review, you have 5 options:

| Action | What it does |
|--------|-------------|
| **approve** | Post the reply |
| **edit** | Provide edited text, then post |
| **reject_reply** | Regenerate with feedback (same target) |
| **reject_target** | Skip target entirely + record why (influences future searches) |
| **skip** | Move to next without posting |

### Target Rejection Feedback Loop

When you `reject_target` with a reason (e.g., "this post is about personal finance, not cloud costs"), that feedback is:
1. Recorded in state as a `TargetRejectionNote`
2. Injected into search criteria generation prompts to avoid similar content
3. Injected into evaluation prompts to exclude similar posts
4. Persisted in the strategy record for cross-session learning

## Project Structure

```
src/              # Agent source code
  index.ts        # Graph definition and entry point
  state.ts        # State schema (including TargetRejectionNote)
  config.ts       # Configuration
  nodes/          # All graph nodes (11 files)
  lib/            # Shared utilities (LLM, prompts, search)
  templates/      # Prompt templates
docs/             # Documentation, SOPs, and specs
  SOP/            # Standard operating procedures (8 files)
  The_agent_specs.md  # Full requirements spec
```

## Graph Flow

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
