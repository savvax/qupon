---
id: 1414
title: CLI action:sweep and the registrar sweeps finished escrows
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
Task 1402 added the on-chain instruction `sweep_escrow` (operator; action Completed / Retiring / Cancelled; escrow balance → an issuer cash account with token authority = series.issuer; escrow closed, rent → signer). Nothing off-chain calls it yet.

## Read first
- `programs/qupon_bonds/src/instructions/settle.rs` (`SweepEscrow`), `clients/ts/src/generated/instructions/sweepEscrow.ts`
- `clients/ts/src/commands/action.ts` (pattern of `action:complete`), `services/registrar/internal/scheduler`, `internal/executor` argv allowlist, `internal/api/advance.go`

## Steps
1. CLI `action:sweep --series <name> --index <n>`: create the issuer's cash ATA idempotently (Token-2022 or legacy per the cash mint's program), send `sweep_escrow` signed by the registrar; JSON on stdout `{ok, signature, slot, amount}`; if the escrow account no longer exists print `{ok:true, skipped:"already swept"}` and exit 0.
2. Registrar: after a successful `complete` step (and after `close_series`, and for Cancelled actions), run `action:sweep` once (scheduler/advance path; allowlisted in the executor). Record an activity row `sweep`. A failed sweep must not fail the completed action: log and continue.
3. Registrar action page (web): show "Escrow swept" (EN/RU) in the action timeline when the activity row exists; no new button.

## Acceptance criteria
- TS test: argv parsing + the "already swept" branch (fake rpc returns no account) → ok:true, exit 0.
- Go test: complete step success → executor called with action:sweep afterwards; sweep failure → completion still reported ok.
- `make verify` green; `reports/worklog/1414.md`.

## Out of scope
Program changes.
