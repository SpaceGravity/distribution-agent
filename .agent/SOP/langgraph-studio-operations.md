# SOP: Running the Agent in LangGraph Studio

## Overview

LangGraph Studio provides a visual UI for running the distribution-agent graph, inspecting state at each node, and handling interrupt-based review flows. This SOP covers the full operational workflow.

> **Automation Skill**: A Claude Code skill (`langgraph-studio-runner`) automates the entire Studio flow via browser. It lives at `~/.claude/skills/langgraph-studio-runner/SKILL.md`. Trigger with: "run in studio", "run idea path", "run business path".

## Prerequisites

1. **Start the dev server** (if not already running):
   ```bash
   pnpm dev
   ```
   If you see `EADDRINUSE: address already in use ::1:2024`, Studio is already running on port 2024 — proceed directly.

2. **Open Studio UI**:
   ```
   https://smith.langchain.com/studio?baseUrl=http://localhost:2024
   ```
   Wait for the green `Connected` badge in the top bar.

3. **Verify `.env`**: Must contain `ANTHROPIC_API_KEY`. For idea path X enrichment, `X_BEARER_TOKEN` is optional.

## Submitting Input

The JSON input editor is at the bottom of the Studio page (defaults to `{}`).

### Idea Path

```json
{
  "mode": "idea",
  "ideaFilePath": "docs/idea.md",
  "selectedPlatforms": ["reddit", "x"],
  "targetCount": 10
}
```

### Business Path

```json
{
  "mode": "business",
  "businessFilePath": "docs/business.md",
  "selectedPlatforms": ["reddit", "x"],
  "targetCount": 10
}
```

### Steps

1. Click the input textbox area (where `{}` appears)
2. Select all (`Cmd+A`) and type your JSON
3. Click **Submit** (blue button, bottom-right of input panel)
4. The **Cancel** button appears while the graph is running

## Interrupt Handling in Studio

When the graph hits a code-level `interrupt()`, the Cancel button disappears and a resume panel appears at the **bottom of the right-side thread panel**.

### Finding the Resume Panel

The right panel can contain hundreds of lines of search results and target data. The resume panel is always at the very bottom. Scrolling manually is slow — use the browser automation skill or this JavaScript snippet in browser DevTools:

```javascript
// Scroll right panel to bottom
document.querySelectorAll('[class*="scroll"], [style*="overflow"]').forEach(el => {
  if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200) {
    el.scrollTop = el.scrollHeight;
  }
});
```

### Resume Panel Format

The resume panel shows:
- **"Provide a value to resume execution for {nodeName}"**
- A JSON editor (line-numbered) defaulting to `""`
- **JSON/RAW** format toggle
- **Resume** button (bottom-right corner)

### Resume Values by Interrupt

| Interrupt Node | Path | Quick Approve | Structured Options |
|---------------|------|---------------|-------------------|
| `batchReviewTargets` | Idea | `"approve"` | `{ "approved": true }` or `{ "rejections": [{ "id": "...", "reason": "..." }] }` |
| `reviewReply` | Business | `"approve"` | `"edit: <text>"`, `"reject_reply: <feedback>"`, `"reject_target: <reason>"`, `"skip"` |
| `askIdeaHelp` | Idea | N/A | Free-text guidance string |
| `askUserHelp` | Business | N/A | Free-text guidance string or `{ "guidance": "..." }` |

### Known UI Issues

1. **Polly icon blocks Resume button**: The LangSmith assistant icon (bottom-right corner) overlaps the Resume button. Close Polly first, or use JavaScript: `document.querySelectorAll('button').forEach(b => { if (b.textContent.trim() === 'Resume') b.click(); })`

2. **"As Node" dropdown**: The dropdown near the Submit button shows which node the graph paused at. This is informational — you do not need to change it.

3. **Stale view after resume**: After clicking Resume, the right panel may not auto-scroll to the new activity. Scroll to bottom to see progress.

## Idea Path Flow (End-to-End)

| Step | Node | Duration | Action Required |
|------|------|----------|-----------------|
| 1 | `getInput` → `understandIdea` | ~30-60s | None (automatic) |
| 2 | `generateIdeaCriteria` → `searchIdea` | ~60-120s | None (API calls) |
| 3 | `extractTargets` → `evaluateIdeaTargets` | ~30-60s | None |
| 4 | `enrichTargets` → `exportCsv` | ~30-60s | None (CSV exported before review) |
| 5 | **`batchReviewTargets`** | Paused | Enter `"approve"` or `{ "rejections": [...] }` and click Resume |
| 6 | `saveMemory` → `__end__` | ~5s | None |

**Total**: ~3-6 minutes plus review time.

### Output Verification

```bash
ls -la output/idea-targets-*.csv
```

CSV columns: `name`, `platform`, `url`, `category`, `why_relevant`, `follower_count`, `status`, `source_post_url`, `source_post_title`.

## Business Path Flow (End-to-End)

| Step | Node | Duration | Action Required |
|------|------|----------|-----------------|
| 1 | `getInput` → `understandBusiness` | ~30s | None |
| 2 | `generateCriteria` → `search` → `evaluate` | ~2-5 min | None (may loop) |
| 3 | **`reviewReply`** (per target) | Paused | Review each draft individually |
| 4 | `postReply` → `saveMemory` → `__end__` | ~10s | None |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Studio shows `EADDRINUSE` | Server already running — navigate to Studio URL |
| `Not connected` badge | Check `.env` exists, restart `pnpm dev` |
| Graph seems stuck (no Cancel, no Resume) | Scroll right panel to bottom; check server logs |
| Resume click does nothing | Polly icon is blocking — use JavaScript click |
| Chrome extension disconnects | Refresh claude.ai tab, re-enable extension; graph state is preserved |

## Related Documentation

- `~/.claude/skills/langgraph-studio-runner/SKILL.md` — Browser automation skill for Studio
- `.agent/SOP/langgraph-interrupts-and-resume.md` — Interrupt patterns and resume API
- `.agent/SOP/typescript-esm-and-tooling.md` — LangGraph Studio config and startup
- `.agent/System/architecture.md` — Full system architecture and node routing
