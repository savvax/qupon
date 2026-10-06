---
id: 1108
title: Motion polish v3 across the product
agent: claude
tier: T1
depends_on: [1105, 1107]
verify: make verify
timeout_min: 150
---
## Goal
Implement **Task 1108** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md` §5.8).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints" and Task 1108

## Acceptance criteria
- Every item of Task 1108 is done and covered by a test where the item names one; EN and RU; reduced motion respected.
- `make verify` green; `reports/worklog/1108.md` written.

## Out of scope
Other tasks of the plan.
