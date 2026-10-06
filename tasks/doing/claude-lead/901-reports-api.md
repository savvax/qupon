---
id: 901
title: Report builders and endpoints (statement, tax, holders, payouts)
agent: claude
tier: T1
depends_on: [801]
verify: make verify
timeout_min: 75
---
## Goal
Implement **Task 901** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints", "Review Focus" and Task 901
- the spec sections Task 901 cites
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. Respect the Go/web feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file; no OpenAPI edits unless this is task 1204).

## Acceptance criteria
- Everything the task lists (routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; simulated parts labelled SIMULATED.
- `make verify` green; `reports/worklog/901.md` written.

## Out of scope
Other tasks of the plan.
