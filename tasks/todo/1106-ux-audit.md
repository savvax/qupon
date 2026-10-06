---
id: 1106
title: UX audit of every page and fix tasks
agent: claude
tier: T1
depends_on: [1103, 1104]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 1106** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md` §5.7–5.8).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints" and Task 1106
- spec §5.6–5.8

## Acceptance criteria
- Everything Task 1106 lists exists and behaves as written; EN and RU; reduced motion respected; tests listed pass.
- `make verify` green; `reports/worklog/1106.md` written.

## Out of scope
Other tasks of the plan.
