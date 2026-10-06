---
id: 1305
title: Submission texts: secondary settlement via Solana DvP, positioning, naming
agent: claude
tier: T1
depends_on: [1302]
verify: make verify
timeout_min: 45
---
## Goal
Implement **Task 1305** of `docs/superpowers/plans/2026-10-06-plan13-secondary-trades-dvp.md` exactly as written there.

## Read first
- `docs/superpowers/plans/2026-10-06-plan13-secondary-trades-dvp.md` — the header (what exists, DvP facts), "Global Constraints", "Review Focus" and Task 1305
- `docs/03-domain.md` §4a and `docs/02-architecture.md` rows 8, 19, 20
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. The S5 row needs the transaction links in `reports/demo-trade.md`: if that file does not exist yet, print `BLOCKED:1305 reports/demo-trade.md missing (lead runs make demo-trade after the devnet deploy)` and stop. Respect the feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file).

## Acceptance criteria
- Everything the task lists (commands, routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; nothing in the trade flow is labelled SIMULATED.
- `make verify` green; `reports/worklog/1305.md` written.

## Out of scope
Other tasks of the plan; changes to `programs/qupon_bonds`.
