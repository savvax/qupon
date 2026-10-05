---
id: 023
title: Executor: run qupon CLI steps with JSON contract, timeouts, idempotency; POST /actions/{pda}/advance
agent: glm
tier: T1
depends_on: [021, 018]
verify: make verify
timeout_min: 45
---
## Goal
Let the service drive the lifecycle without holding business logic twice: it calls the CLI and verifies the chain afterwards.

## Read first
- docs/02-architecture.md (data flow)
- clients/ts/src/cli.ts

## Steps
1. `internal/executor`: `Run(ctx, args...)` exec of `$QUPON_CLI` with `--json`, timeout 120 s, parses `{ok, signature, slot, error}`; `NextStep(action)` maps on-chain status → CLI command (Announced→strike, RecordStruck→snapshot/finalize, SnapshotComplete→(wait for fund)/fund in autofund mode, Funded/Settling→pay/complete, Retiring→retire/close, VotingOpen→(wait)/finalize, Finalized→apply).
2. `POST /actions/{pda}/advance` body `{confirm:true, autofund?:bool}` → runs one step, re-reads chain, returns the new status + signature; records in `activity`.
3. Tests with a fake CLI binary (shell script in testdata echoing JSON).

## Acceptance criteria
- [ ] Advancing a demo action through the API moves it to Completed step by step; errors from the CLI surface as 409 with the CLI message.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/023.md`, then print exactly `DONE:023` or `BLOCKED:023 <reason>`.
