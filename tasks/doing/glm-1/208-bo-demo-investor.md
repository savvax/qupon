---
id: 208
title: Demo investor endpoints; container gets KYC-provider and demo-investor keys
agent: glm
tier: T1
depends_on: [203]
verify: make verify
timeout_min: 90
---
## Goal
Implement **Task 8** of `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` exactly as written there (files, interfaces, tests, code). The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`.

## Read first
- `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` — the header (Goal, Architecture, Global Constraints, Review Focus), the File Structure, and **Task 8** in full
- `docs/superpowers/specs/2026-10-05-qupon-product-design.md` (sections the plan cites)
- the files listed under Task 8 "Files"

## Steps
Follow Task 8's checkbox steps in order (TDD: failing test → run → implement → run → commit). Keep names and signatures exactly as in its **Interfaces** block — other tasks depend on them. Do not edit other tasks' files beyond what Task 8 lists.

## Acceptance criteria
- [ ] Every step of Task 8 done; its tests pass; `make verify` green.
- [ ] Interfaces match the plan verbatim (later tasks import them).
- [ ] `reports/worklog/208.md` written (3–6 lines: what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 208`, then print exactly `DONE:208` or `BLOCKED:208 <reason>`.
