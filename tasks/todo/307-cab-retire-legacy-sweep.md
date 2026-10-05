---
id: 307
title: Retire legacy pages with redirects; EN/RU × desktop/mobile sweep; deploy
agent: claude
tier: T1
depends_on: [302, 303, 304, 305, 306, 106, 107, 108]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 7** of `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` exactly as written there. The plan implements the approved product spec `docs/superpowers/specs/2026-10-05-qupon-product-design.md`; it builds on Plan 1 (UI components) and Plan 2 (back-office API).

## Read first
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` — header (Global Constraints, Review Focus), File Structure, and **Task 7** in full
- `docs/superpowers/plans/2026-10-05-plan1-ui-foundation.md` Interfaces of the components you use
- `docs/superpowers/plans/2026-10-05-plan2-backoffice-api.md` routes you call
- the files listed under Task 7

## Steps
Follow Task 7's checkbox steps in order (tests first). Use only design-system components and tokens; every string through next-intl (EN + RU, real Russian); every write through `runWrite` (toasts with tx links).

## Acceptance criteria
- [ ] Every step of Task 7 done; its unit tests and Playwright spec pass; `make verify` green.
- [ ] Screenshots of the new pages at 1440 and 390 px in EN and RU saved under `reports/ui/` and referenced in the worklog.
- [ ] `reports/worklog/307.md` written (what changed, deviations from the plan and why).

## Finish
Run `make verify`, commit on your task branch with `task: 307`, then print exactly `DONE:307` or `BLOCKED:307 <reason>`.
