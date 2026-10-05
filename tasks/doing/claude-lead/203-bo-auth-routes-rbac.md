---
id: 203
title: Sign-in routes, requireRole middleware, audit helper; sessions replace ADVANCE_TOKEN
agent: claude
tier: T1
depends_on: [202]
verify: make verify
timeout_min: 90
---
## Goal
Implement **Task 3** of `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` exactly as written there (files, interfaces, tests, code). The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`.

## Read first
- `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` — the header (Goal, Architecture, Global Constraints, Review Focus), the File Structure, and **Task 3** in full
- `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections the plan cites)
- the files listed under Task 3 "Files"

## Steps
Follow Task 3's checkbox steps in order (TDD: failing test → run → implement → run → commit). Keep names and signatures exactly as in its **Interfaces** block — other tasks depend on them. Do not edit other tasks' files beyond what Task 3 lists.

## Acceptance criteria
- [ ] Every step of Task 3 done; its tests pass; `make verify` green.
- [ ] Interfaces match the plan verbatim (later tasks import them).
- [ ] `reports/worklog/203.md` written (3–6 lines: what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 203`, then print exactly `DONE:203` or `BLOCKED:203 <reason>`.
