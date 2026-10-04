---
id: 024
title: Scheduler/autopilot: announce ahead of schedule, strike at record date, pay when funded; dry-run and approval gate
agent: glm
tier: T1
depends_on: [023]
verify: make verify
timeout_min: 45
---
## Goal
The 'agent proposes, human approves' loop that makes the product continuous.

## Read first
- docs/01-product.md
- docs/02-architecture.md (data flow)

## Steps
1. `internal/scheduler`: ticker (configurable, default 30 s) per series: if no open action and `now ≥ next_coupon_date − lead` → announce INTR (lead configurable, demo 2 min); if action Announced and `now ≥ record_at` → strike + snapshot + finalize; if SnapshotComplete and `autofund` → fund from paying agent; if Funded and `now ≥ payment_at` → pay + complete; at maturity → announce REDM. `approval_required=true` → the scheduler creates a `pending_approval` row instead of executing; `POST /approvals/{id}/approve` executes.
2. `GET /schedule` shows planned actions; `GET /approvals` lists pending.
3. Dry-run flag logs what it would do.

## Acceptance criteria
- [ ] With `--demo-speed` the scheduler runs a full coupon cycle on devnet unattended; tests cover the decision function with a fake clock.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/024.md`, then print exactly `DONE:024` or `BLOCKED:024 <reason>`.
