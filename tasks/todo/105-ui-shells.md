---
id: 105
title: PublicShell (top nav, mobile drawer, footer) and CabinetShell (sidebar, topbar, bottom nav)
agent: claude
tier: T1
depends_on: [102, 103, 104]
verify: make verify
timeout_min: 90
---
## Goal
Implement **Task 5** of `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` exactly as written there (files, interfaces, tests, code). The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`.

## Read first
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` — the header (Goal, Architecture, Global Constraints, Review Focus), the File Structure, and **Task 5** in full
- `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections the plan cites)
- the files listed under Task 5 "Files"

## Steps
Follow Task 5's checkbox steps in order (TDD: failing test → run → implement → run → commit). Keep names and signatures exactly as in its **Interfaces** block — other tasks depend on them. Do not edit other tasks' files beyond what Task 5 lists.

## Acceptance criteria
- [ ] Every step of Task 5 done; its tests pass; `make verify` green.
- [ ] Interfaces match the plan verbatim (later tasks import them).
- [ ] `reports/worklog/105.md` written (3–6 lines: what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 105`, then print exactly `DONE:105` or `BLOCKED:105 <reason>`.
