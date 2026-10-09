---
id: 1422
title: Approved complete/close also sweep the escrow
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
Review of 1414: with ApprovalRequired, an approved `complete_action` / `close_series` (services/registrar/internal/api/approvals.go ~L90-128) runs the CLI and returns without the follow-up sweep that the advance path does (advance.go `sweepEscrow`). Both steps clear `open_action`, so the escrow is never swept. Also after a sweep, `NextStep` for a Completed action keeps offering "sweep" forever.

## Steps
1. After `FinishApproval`, when the step is complete or close, call the same `sweepEscrow` helper (rebuild series name and index from `row.Args` with `flagValue`). Failures only log, like the advance path.
2. NextStep: return no step for a Completed/Retiring-done/Cancelled action once a `sweep` activity row exists for it (or the escrow account is gone); the UI then shows no next-step button.

## Acceptance criteria
- Go test: approve a complete step → executor called with action:sweep afterwards; sweep failure → approval still executed.
- Go test: NextStep after a recorded sweep → no step.
- `make verify` green; `reports/worklog/1422.md`.
