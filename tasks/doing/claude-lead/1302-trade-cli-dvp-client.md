---
id: 1302
title: DvP client, trade:* CLI and devnet trade demo
agent: glm
tier: T2
depends_on: [1301]
verify: make verify
timeout_min: 60
---
## Goal
Implement **Task 1302** of `docs/superpowers/plans/2026-10-06-plan13-secondary-trades-dvp.md` exactly as written there.

## Read first
- `docs/superpowers/plans/2026-10-06-plan13-secondary-trades-dvp.md` — the header (what exists, DvP facts), "Global Constraints", "Review Focus" and Task 1302
- `docs/03-domain.md` §4a and `docs/02-architecture.md` rows 8, 19, 20
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. Respect the feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file).

## Acceptance criteria
- Everything the task lists (commands, routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; nothing in the trade flow is labelled SIMULATED.
- `make verify` green; `reports/worklog/1302.md` written.

## Out of scope
Other tasks of the plan; changes to `programs/qupon_bonds`.
