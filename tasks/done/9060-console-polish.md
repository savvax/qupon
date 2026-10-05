---
id: 9060
title: Console polish for judges — home ordering, amount grouping, portal read-only view, CORS for browser reads
agent: claude
tier: T1
depends_on: [030, 031]
verify: make verify
timeout_min: 45
---
## Goal
Visual QA of home / series / portal against devnet (production build) and fix what a judge would trip over.

## Acceptance criteria
- [ ] Home lists active series first, closed collapsed; amounts grouped; portal works in a browser against the API (CORS) and has a read-only `?owner=` view; `make verify` green.
