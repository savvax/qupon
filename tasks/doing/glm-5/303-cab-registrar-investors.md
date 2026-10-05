---
id: 303
title: Registrar dashboard (pipeline, alerts) and investor onboarding (SAS KYC + registration), suspend/reinstate
agent: glm
tier: T1
depends_on: [301, 207]
verify: make verify
timeout_min: 150
---
## Goal
Implement **Task 3** of `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` exactly as written there. The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`; it builds on Plan 1 (UI components) and Plan 2 (back-office API).

## Read first
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` — header (Global Constraints, Review Focus), File Structure, and **Task 3** in full
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` Interfaces of the components you use
- `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` routes you call
- the files listed under Task 3

## Steps
Follow Task 3's checkbox steps in order (tests first). Use only design-system components and tokens; every string through next-intl (EN + RU, real Russian); every write through `runWrite` (toasts with tx links).

## Acceptance criteria
- [ ] Every step of Task 3 done; its unit tests and Playwright spec pass; `make verify` green.
- [ ] Screenshots of the new pages at 1440 and 390 px in EN and RU saved under `reports/ui/` and referenced in the worklog.
- [ ] `reports/worklog/303.md` written (what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 303`, then print exactly `DONE:303` or `BLOCKED:303 <reason>`.
