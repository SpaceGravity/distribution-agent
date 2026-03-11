# Lesson: Batch review vs sequential review — different patterns for different needs

## Two review patterns in the same project

### Sequential (business path — `reviewReply`)
- Present one draft at a time
- User acts on each: approve, edit, reject_reply, reject_target, skip
- `currentReviewIndex` tracks position
- Self-loops back to same node after each action
- Good for: items that need individual attention (reply drafts)

### Batch (idea path — `batchReviewTargets`, `reviewOutreach`)
- Present all items at once
- User approves all or rejects specific ones by ID
- No index tracking — single interrupt per cycle
- Rejections trigger a backfill loop (re-search to fill gaps)
- Review cycle counter prevents infinite loops (`IDEA_MAX_REVIEW_CYCLES: 5`)
- Good for: items where the set matters more than individuals (target lists)

## Key difference in Command routing

Sequential: routes to itself (self-loop) or to next node
```ts
.addNode('reviewReply', reviewReply, {
  ends: ['postReply', 'reviewReply', 'saveMemory'],  // self-loop included
})
```

Batch: routes to next stage or back to refinement (backfill)
```ts
.addNode('batchReviewTargets', batchReviewTargets, {
  ends: ['generateOutreach', 'generateIdeaCriteria'],  // no self-loop
})
```

## Lesson
Don't force one pattern onto both use cases. Sequential review is better when each item needs custom action (approve/edit/reject). Batch review is better when the user evaluates the collection as a whole.

## Related
- `.agent/SOP/langgraph-interrupts-and-resume.md` — Both patterns documented
