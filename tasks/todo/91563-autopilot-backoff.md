---
id: 91563
title: autopilot backs off on persistent chain refusals (no 5-second retry loops)
agent: flash
tier: T1
depends_on: [91562]
verify: make verify
timeout_min: 90
---
## Goal
The production scheduler (SCHEDULER=1) retries refused steps every few seconds forever ("refused by chain (will retry)"):
`SBX-EK5G3N` REDM announce → `TradesInFlight (6032)` (a sandbox DvP trade admitted but never settled);
`SBX-SY9BHF` INTR announce → `ActionAlreadyOpen (6006)` / `ConstraintSeeds (2006)` (a sandbox whose creation failed
half-way: series on chain, registry row rolled back). ~100 failed simulations per 3 h, log noise, wasted RPC.

## Read first
services/registrar/internal/scheduler (the loop and its retry), internal/executor (NextStep), internal/sandbox.

## Do
- Per (series, step) exponential backoff on a chain refusal: 10 s → doubling → cap 15 min; reset on success or when the
  step changes. Log the first refusal at WARN and repeats at DEBUG.
- The autopilot drives only series it owns: a registry row exists, or a sandbox row, or a curated showcase mint. Series on
  the demo clock without any of those (failed half-created sandboxes) are skipped (log once).
- For a sandbox series whose next coupon is blocked by `TradesInFlight`, cancel/release the stale admitted trade if the
  CLI has a command for it (check `clients/ts/src/commands/trade*.ts`); otherwise just back off.
- Tests: backoff schedule (inject clock), skip rule, reset on success.

## Acceptance
Go tests green; `make verify` green. Commit `fix(scheduler): back off on chain refusals; drive only owned series`
(`task: 91563`). Do NOT deploy.

## Finish
Write `reports/worklog/91563.md` (3–6 lines), commit with `task: 91563`, print `DONE:91563` or `BLOCKED:91563 <reason>`.
