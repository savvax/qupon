---
id: 1408
title: CLI pay/snapshot report completed batches on failure; registrar records them
agent: glm
tier: T1
depends_on: [1406]
verify: make verify
timeout_min: 60
---
## Goal
`clients/ts/src/commands/action.ts` pay (~L305-325) and snapshot (~L207-231): if batch 2 of 3 throws, nothing reaches stdout, so signatures of batches that already moved money are lost from the registrar's activity log.
1. Wrap the batch loop: on failure print `{ok:false, error, results:[...completed batches with signatures]}` on stdout, set exit code 1.
2. Registrar executor (services/registrar/internal/executor): on non-zero exit, parse stdout JSON if present and record the completed signatures in activity before returning the error.

## Acceptance criteria
- TS test: sendQuiet stubbed to fail on the 2nd call → stdout JSON has 1 result, exit code 1.
- Go test: fake CLI exits 1 with partial JSON → activity rows for the completed signatures, error returned.
- `make verify` green; `reports/worklog/1408.md`.
