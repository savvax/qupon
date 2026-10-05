---
id: 404
title: Live e2e mode (E2E_BASE_URL): public pages, legacy redirects, demo roles, real series creation
agent: glm
tier: T1
depends_on: [307]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 4** of `docs/superpowers/plans/2026-10-05-plan4-launch.md` exactly as written there (product spec: `docs/superpowers/specs/2026-10-05-qupon-product-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-05-plan4-launch.md` — header (Global Constraints, Review Focus) and **Task 4**
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` (As built notes under Task 1) for sessions, mock mode and `useRunWrite`
- the files listed under Task 4

## Acceptance criteria
- [ ] Every checkbox of Task 4 done; `make verify` green; the mock-mode Playwright suite (`API_MOCKING=enabled pnpm -C apps/web exec playwright test`) green.
- [ ] `reports/worklog/404.md` written (what changed, deviations and why).

## Finish
Run `make verify`, commit with `task: 404`, then print exactly `DONE:404` or `BLOCKED:404 <reason>`.
