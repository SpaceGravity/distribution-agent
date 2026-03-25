---
paths:
  - "src/nodes/search*.ts"
  - "src/nodes/refine*.ts"
  - "src/lib/search-runner.ts"
---
# Search Node Rules

- LLM-generated queries MUST NOT contain site: operators — platform filtering via --search= flag
- Cap queries to 5 content + 3 community max — LLM tends to over-generate
- Search timeout: 5 min hard fail, log stderr
- X search degrades gracefully — use Reddit-only fallback if xAI times out
- API model aliases change without notice — verify against /v1/models endpoint
