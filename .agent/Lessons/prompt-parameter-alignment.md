# Lesson: Prompt functions must accept all data their callers need to pass

## Problem
`askIdeaHelp` collected user guidance and stored it in `state.userGuidance`. When `generateIdeaCriteria` (via `refineIdeaSearch`) was called next, it invoked `ideaCriteriaPrompt()` — but that function only accepted 3 parameters (understanding, rejectionNotes, evaluationHistory). The user's guidance was silently discarded, making the help interrupt useless.

## Fix
Added `userGuidance?: string` as a 4th parameter to `ideaCriteriaPrompt()` and updated both callers (`generateIdeaCriteria` and `refineIdeaSearch`) to pass it through.

## Rule
When a node stores data in state that downstream nodes consume via a prompt function, verify the full chain:
1. **State field exists** — the storing node writes it
2. **Prompt function accepts it** — parameter exists in signature
3. **Caller passes it** — the node that calls the prompt reads from state and passes it

If any link is missing, the data silently disappears. This is hard to catch without tracing the full flow.

## Related
- `.agent/SOP/llm-structured-output-and-prompts.md` — Prompt function patterns
- `.agent/Lessons/api-enrichment-resilience.md` — Another "silent failure" pattern
