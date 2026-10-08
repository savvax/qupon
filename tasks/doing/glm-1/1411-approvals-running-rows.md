---
id: 1411
title: Approvals never stay stuck in "running"
agent: glm
tier: T1
depends_on: [1406]
verify: make verify
timeout_min: 45
---
## Goal
`services/registrar/internal/api/approvals.go` (~L84-100): after `ClaimApproval`, the follow-ups `RevertApproval` / `FinishApproval` use `r.Context()`. A client disconnect cancels it, the revert fails and the row stays `running` forever (nothing sweeps it; the UI lists only pending and executed), although the CLI may have landed.

## Steps
1. Use `context.WithoutCancel(r.Context())` for every store call after the claim (revert and finish), like the CLI run itself (task 1406).
2. On registrar startup, reset approvals left in `running` to `pending` (store method + call in `cmd/registrar/main.go`), logging how many.

## Acceptance criteria
- Test: cancel the request context while a fake executor runs → row ends `executed` or `pending`, never `running`.
- Test: a `running` row is `pending` after the startup sweep.
- `make verify` green; `reports/worklog/1411.md`.
