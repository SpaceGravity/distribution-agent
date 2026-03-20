# Lesson: Browser Automation with LangGraph Studio

## Context

Running the distribution-agent through LangGraph Studio via Chrome browser automation (Claude in Chrome extension).

## Key Lessons

### 1. Always Use JavaScript to Scroll the Right Panel

The Studio right panel (thread/state view) can contain hundreds of lines of search results, target data, and node outputs. Manual scrolling with `scroll` actions takes many iterations and wastes significant time.

**Do this instead:**
```javascript
document.querySelectorAll('[class*="scroll"], [style*="overflow"]').forEach(el => {
  if (el.scrollHeight > el.clientHeight + 100 && el.clientHeight > 200) {
    el.scrollTop = el.scrollHeight;
  }
});
```

### 2. Always Use JavaScript to Click the Resume Button

The LangSmith "Polly" assistant icon sits in the bottom-right corner and overlaps the Resume button. Clicking by coordinates or even by `ref` will hit Polly instead.

**Do this instead:**
```javascript
const buttons = Array.from(document.querySelectorAll('button'));
const resumeBtn = buttons.find(b => b.textContent.trim().includes('Resume'));
if (resumeBtn) resumeBtn.click();
```

### 3. Chrome Extension Disconnects During Long Waits

The Claude in Chrome extension can disconnect during 30-second wait periods. This happened twice in one session. The graph state is preserved in the SQLite checkpointer, so no data is lost — just reconnect and continue from the interrupt.

**Mitigation**: Use shorter wait intervals (10-15s) and check connectivity with `tabs_context_mcp` before attempting actions after a wait.

### 4. String Shortcuts Work for All Interrupts

All review interrupt nodes accept the string `"approve"` as a shortcut, not just the full JSON `{ "approved": true }`. This is simpler to type in the Studio resume field. The string value goes directly in the JSON editor — it must include the quotes: `"approve"`.

### 5. Timing Expectations Are Important

Knowing how long each phase takes prevents premature screenshots and wasted wait cycles:
- LLM analysis nodes: 30-60 seconds
- Search nodes (API calls): 60-120 seconds
- Total to first interrupt (idea path): ~3-5 minutes

### 6. The "As Node" Dropdown Is Informational Only

The dropdown near the Submit button shows which node the graph is paused at. It does NOT need to be changed to resume. The Resume button in the interrupt panel handles routing automatically.

## Related Documentation

- `~/.claude/skills/langgraph-studio-runner/SKILL.md` — The automation skill built from these lessons
- `.agent/SOP/langgraph-studio-operations.md` — Full SOP for Studio operations
- `.agent/SOP/langgraph-interrupts-and-resume.md` — Interrupt patterns and resume API
