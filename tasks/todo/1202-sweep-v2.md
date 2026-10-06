---
id: 1202
title: Sweep extension for every new page
agent: flash
tier: T1
depends_on: [604, 605, 703, 704, 705, 804, 806, 807, 902, 1002, 1102]
verify: make verify
timeout_min: 45
---
## Goal
Implement **Task 1202** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints", "Review Focus" and Task 1202
- the spec sections Task 1202 cites
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. Respect the Go/web feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file; no OpenAPI edits unless this is task 1204).

## Acceptance criteria
- Everything the task lists (routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; simulated parts labelled SIMULATED.
- `make verify` green; `reports/worklog/1202.md` written.

## Out of scope
Other tasks of the plan.
