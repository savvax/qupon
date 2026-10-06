---
id: 1102
title: Motion across pages and landing hero
agent: glm
tier: T1
depends_on: [1101]
verify: make verify
timeout_min: 60
---
## Goal
Implement **Task 1102** of `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` exactly as written there (spec: `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — "Global Constraints", "Review Focus" and Task 1102
- the spec sections Task 1102 cites
- every file listed under the task's **Read first** / **Files**

## Steps
Follow the task's checklist. Respect the Go/web feature layout rules in Global Constraints (own files, own anchor, own i18n namespace and mock file; no OpenAPI edits unless this is task 1204).

## Acceptance criteria
- Everything the task lists (routes, status codes, UI, tests) exists and behaves as written; its listed tests pass.
- EN and RU strings for every new UI text; simulated parts labelled SIMULATED.
- `make verify` green; `reports/worklog/1102.md` written.

## Out of scope
Other tasks of the plan.
