---
blocked_reason: rebase conflict with main
id: 022
title: Reconciliation: recompute entitlements from chain balances at snapshot slot and compare with Entitlement PDAs
agent: glm
tier: T1
depends_on: [021, 004]
verify: make verify
timeout_min: 45
---
## Goal
The registrar independently verifies what the program did — the control a CSD would run.

## Read first
- docs/03-domain.md (§4 hash ordering)
- internal/entitlement

## Steps
1. `internal/reconcile`: for an action, list investors (sorted by owner ascending), read each bond ATA balance (`minContextSlot = snapshot_slot` where supported; fall back to current balances while paused), compute expected gross/tax/net/principal with `internal/entitlement`, recompute `snapshot_hash`, compare with on-chain Entitlements and totals; produce a report {ok, holders, mismatches[], expectedHash, onchainHash, supply, unitsSnapshotted}.
2. `GET /actions/{pda}/reconcile`; store the report in `runs`.

## Acceptance criteria
- [ ] On a completed demo action the report is `ok:true` with matching hash; a unit test injects a mismatched entitlement and expects `ok:false` with the holder listed.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/022.md`, then print exactly `DONE:022` or `BLOCKED:022 <reason>`.
