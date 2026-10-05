---
id: 403
title: Deploy plans 1–3 to the VPS and walk the full lifecycle live (EN/RU, desktop/phone)
agent: claude
tier: T1
depends_on: [307, 401, 402]
verify: make verify
timeout_min: 120
---
## Goal
Implement **Task 3** of `docs/superpowers/plans/2026-10-05-plan4-launch.md` exactly as written there (product spec: `docs/superpowers/specs/2026-10-05-qupon-product-design.md`).

## Read first
- `docs/superpowers/plans/2026-10-05-plan4-launch.md` — header (Global Constraints, Review Focus) and **Task 3**
- `docs/superpowers/plans/2026-10-05-plan3-cabinets.md` (As built notes under Task 1) for sessions, mock mode and `useRunWrite`
- the files listed under Task 3

## Acceptance criteria
- [ ] Every checkbox of Task 3 done; `make verify` green; the mock-mode Playwright suite (`API_MOCKING=enabled pnpm -C apps/web exec playwright test`) green.
- [ ] `reports/worklog/403.md` written (what changed, deviations and why).

## Finish
Run `make verify`, commit with `task: 403`, then print exactly `DONE:403` or `BLOCKED:403 <reason>`.
