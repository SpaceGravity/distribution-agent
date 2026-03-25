---
paths:
  - "src/nodes/review*.ts"
  - "src/nodes/batch-review*.ts"
---
# Review Node Rules

- Batch review MUST explicitly set status: 'approved' on pending items — empty {} leaves them pending
- 5 review actions: approve | edit | reject_reply | reject_target | skip
- reject_target records TargetRejectionNote (reason, platform, title)
- Rejection notes injected into criteria + evaluation prompts as XML blocks
