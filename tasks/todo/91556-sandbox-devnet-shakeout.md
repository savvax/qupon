---
id: 91556
title: "URGENT: make the judge sandbox work end to end on devnet with the real CLI"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
`POST /demo/sandbox` on production fails step after step — every bug was invisible to the fake-CLI tests. Fixed so far:
holder keypairs (QUPON_INVESTOR<n>_KEYPAIR fallback), KYC data = registration data (91540), tKZT faucet (config). Current
failure: `executor_failed: bank route Nomad Pension: cli payout:route refused: qupon: --bank-ref is required for the bank
route` (`services/registrar/internal/sandbox/sandbox.go` calls `payout:route --route bank` without `--bank-ref`).
There are likely more after it. Shake the whole flow out against devnet in one pass.

## Read first
- services/registrar/internal/sandbox/sandbox.go (+ tests), internal/api/sandbox.go, internal/scheduler (autopilot drives
  sandboxes: SCHEDULER=1, AUTOFUND=1), apps/web/src/lib/sandbox.ts (contract), apps/web/e2e/live/sandbox.spec.ts,
  docs/04-stack.md (how to run the registrar locally: `make api`, .env keys, `QUPON_CONFIG=config/devnet.json`).

## Do
1. Fix the `--bank-ref` call (a SIMULATED reference text, e.g. `SANDBOX-<id>-NOMAD (SIMULATED)`).
2. Run the registrar locally against devnet with the repo's `.env` (`SCHEDULER=1 AUTOFUND=1`, demo keys from `.env`,
   a throw-away SQLite path), then loop: `curl -X POST localhost:8080/demo/sandbox -d '{"requestId":"<unique>"}'` →
   read the error → fix → rerun, until creation succeeds; then poll `GET /demo/sandbox/<id>` until the first coupon is
   paid by the autopilot (≤ 7 min), run each scenario (`skip_funding`, `cure`, `non_kyc_transfer`, `dvp_trade`) and
   fix what fails. Stop processes by PID when done (never `pkill -f` broad patterns).
3. Make the fake CLI in the sandbox tests reproduce every check you hit (required flags, KYC data match, faucet asset
   allow-list), so CI fails on these from now on.
4. Write `reports/sandbox-devnet.md`: each step with its devnet tx link (explorer `?cluster=devnet`), what failed and the fix.

## Acceptance
A sandbox created through the local registrar reaches "first coupon paid" on devnet and all four scenarios return their
documented result; Go tests green; `make verify` green. Commit `fix(sandbox): end-to-end on devnet` (`task: 91556`).

## Finish
Write `reports/worklog/91556.md` (3–6 lines), commit with `task: 91556`, print `DONE:91556` or `BLOCKED:91556 <reason>`.
