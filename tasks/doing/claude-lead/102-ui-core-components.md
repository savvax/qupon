---
id: 102
title: Core UI components: Button, Badge, Amount, Address, Card, Kpi, Stepper, Skeleton, EmptyState
agent: claude
tier: T1
depends_on: [101]
verify: make verify
timeout_min: 60
---
## Goal
Implement **Task 2** of `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` exactly as written there (files, interfaces, tests, code). The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`.

## Read first
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` — the header (Goal, Architecture, Global Constraints, Review Focus), the File Structure, and **Task 2** in full
- `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections the plan cites)
- the files listed under Task 2 "Files"

## Steps
Follow Task 2's checkbox steps in order (TDD: failing test → run → implement → run → commit). Keep names and signatures exactly as in its **Interfaces** block — other tasks depend on them. Do not edit other tasks' files beyond what Task 2 lists.

## Acceptance criteria
- [ ] Every step of Task 2 done; its tests pass; `make verify` green.
- [ ] Interfaces match the plan verbatim (later tasks import them).
- [ ] `reports/worklog/102.md` written (3–6 lines: what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 102`, then print exactly `DONE:102` or `BLOCKED:102 <reason>`.
