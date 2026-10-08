---
id: 1413
title: Approved pay/snapshot runs record their partial batches
agent: claude
tier: T1
depends_on: [1408]
verify: make verify
timeout_min: 30
---
## Goal
Review of 1408: the approve path (approvals.go) reverts a failed pay/snapshot run without recording the signatures of batches that already moved money; recordPartialBatches (advance.go) writes with r.Context(). Record partial batches on the approve path too, with the detached context.
## Acceptance criteria
- Test: approve a pay step whose fake executor fails with 1 completed batch → one activity row with that signature, approval back to pending.
- `make verify` green; `reports/worklog/1413.md`.
