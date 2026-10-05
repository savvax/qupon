---
id: 401
title: Production polish: security headers, 404/500 pages in the new design, icon, OG image, page titles
agent: glm
tier: T1
depends_on: [302]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 1** of `docs/superpowers/plans/2026-10-05-plan4-launch.md` exactly as written there (product spec: `docs/superpowers/specs/2026-10-05-qupon-product-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-05-plan4-launch.md` — header (Global Constraints, Review Focus) and **Task 1**
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` (As built notes under Task 1) for sessions, mock mode and `useRunWrite`
- the files listed under Task 1

## Acceptance criteria
- [ ] Every checkbox of Task 1 done; `make verify` green; the mock-mode Playwright suite (`API_MOCKING=enabled pnpm -C apps/web exec playwright test`) green.
- [ ] `reports/worklog/401.md` written (what changed, deviations and why).

## Finish
Run `make verify`, commit with `task: 401`, then print exactly `DONE:401` or `BLOCKED:401 <reason>`.
