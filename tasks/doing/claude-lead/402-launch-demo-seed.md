---
id: 402
title: Demo data that never runs out: make demo-seed + registrar re-index
agent: claude
tier: T1
depends_on: [307]
verify: make verify
timeout_min: 90
---
## Goal
Implement **Task 2** of `docs/superpowers/plans/2026-10-05-plan4-launch.md` exactly as written there (product spec: `docs/superpowers/specs/2026-10-05-qupon-product-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-05-plan4-launch.md` — header (Global Constraints, Review Focus) and **Task 2**
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` (As built notes under Task 1) for sessions, mock mode and `useRunWrite`
- the files listed under Task 2

## Acceptance criteria
- [ ] Every checkbox of Task 2 done; `make verify` green; the mock-mode Playwright suite (`API_MOCKING=enabled pnpm -C apps/web exec playwright test`) green.
- [ ] `reports/worklog/402.md` written (what changed, deviations and why).

## Finish
Run `make verify`, commit with `task: 402`, then print exactly `DONE:402` or `BLOCKED:402 <reason>`.
