---
id: 101
title: Design tokens, Manrope, route groups (legacy pages kept)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
Implement **Task 1** of `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` exactly as written there (files, interfaces, tests, code). The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`.

## Read first
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` — the header (Goal, Architecture, Global Constraints, Review Focus), the File Structure, and **Task 1** in full
- `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections the plan cites)
- the files listed under Task 1 "Files"

## Steps
Follow Task 1's checkbox steps in order (TDD: failing test → run → implement → run → commit). Keep names and signatures exactly as in its **Interfaces** block — other tasks depend on them. Do not edit other tasks' files beyond what Task 1 lists.

## Acceptance criteria
- [ ] Every step of Task 1 done; its tests pass; `make verify` green.
- [ ] Interfaces match the plan verbatim (later tasks import them).
- [ ] `reports/worklog/101.md` written (3–6 lines: what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 101`, then print exactly `DONE:101` or `BLOCKED:101 <reason>`.
