---
id: 1203
title: Live devnet walk, deploy and docs for platform v2
agent: claude
tier: T1
depends_on: [1201, 1202, 1204]
verify: make verify
timeout_min: 180
---
## Goal
Implement **Task 1203** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints", "Review Focus" and Task 1203
- the spec sections Task 1203 cites
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. Respect the Go/web feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file; no OpenAPI edits unless this is task 1204).

## Acceptance criteria
- Everything the task lists (routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; simulated parts labelled SIMULATED.
- `make verify` green; `reports/worklog/1203.md` written.

## Out of scope
Other tasks of the plan.
