---
id: 305
title: Registrar activity, operator audit trail, autopilot approvals
agent: glm
tier: T1
depends_on: [301, 207]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 5** of `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` exactly as written there. The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`; it builds on Plan 1 (UI components) and Plan 2 (back-office API).

## Read first
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` — header (Global Constraints, Review Focus), File Structure, and **Task 5** in full
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` Interfaces of the components you use
- `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` routes you call
- the files listed under Task 5

## Steps
Follow Task 5's checkbox steps in order (tests first). Use only design-system components and tokens; every string through next-intl (EN + RU, real Russian); every write through `runWrite` (toasts with tx links).

## Acceptance criteria
- [ ] Every step of Task 5 done; its unit tests and Playwright spec pass; `make verify` green.
- [ ] Screenshots of the new pages at 1440 and 390 px in EN and RU saved under `reports/ui/` and referenced in the worklog.
- [ ] `reports/worklog/305.md` written (what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 305`, then print exactly `DONE:305` or `BLOCKED:305 <reason>`.
