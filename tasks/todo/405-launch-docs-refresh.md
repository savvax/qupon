---
id: 405
title: README product tour, architecture/overview/submission docs for the new product
agent: glm
tier: T1
depends_on: [403]
verify: make verify
timeout_min: 90
---
## Goal
Implement **Task 5** of `docs/superpowers/plans/2026-10-05-plan4-launch.md` exactly as written there (product spec: `docs/superpowers/specs/2026-10-05-qupon-product-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-05-plan4-launch.md` — header (Global Constraints, Review Focus) and **Task 5**
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` (As built notes under Task 1) for sessions, mock mode and `useRunWrite`
- the files listed under Task 5

## Acceptance criteria
- [ ] Every checkbox of Task 5 done; `make verify` green; the mock-mode Playwright suite (`API_MOCKING=enabled pnpm -C apps/web exec playwright test`) green.
- [ ] `reports/worklog/405.md` written (what changed, deviations and why).

## Finish
Run `make verify`, commit with `task: 405`, then print exactly `DONE:405` or `BLOCKED:405 <reason>`.
