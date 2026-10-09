---
id: 1524
title: sandbox API — a judge's own bond on a demo clock
agent: glm
tier: T0
depends_on: [1520, 1522]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1524 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1524: sandbox API — a judge's own bond on a demo clock

**Agent:** glm · **Depends on:** 1522 · **Role:** go-backend

**Files:** `internal/api/sandbox.go` (mount anchor `// mount: sandbox`), `internal/sandbox/sandbox.go` (+ tests), migrations `008_sandboxes.sql`, `openapi.yaml` (both copies), `network.go` (`mainnetGuard` also refuses `/demo/sandbox*` and any series create with `daySecs ≠ 0`).

**Endpoints:**
- `POST /demo/sandbox` `{ wallet?: base58 }` → creates a demo-clock series (`--demo-day-secs 1`, 1-year, semi-annual, face 1,000 tKZT, 10 %, ticker `SBX-<6>`), registers the three custodial demo investors (+ `wallet` if given: SAS attest + register + faucet), places 10 / 25 / 65, attaches the sandbox to the visitor (`qupon_sandbox` httpOnly cookie, 24 h) and returns `{ id, mint, ticker, clock: {daySecs, issueTs}, schedule: [...], links }`. Limits: 3 per IP per hour, 30 per day total (configurable); executes via the executor with a 120 s budget, idempotent per request id.
- `GET /demo/sandbox/{id}` → series + actions + next step + countdowns (server time).
- `POST /demo/sandbox/{id}/scenario` `{ kind: "skip_funding" | "cure" | "non_kyc_transfer" | "dvp_trade" }`: skip_funding sets `no_autofund=1` so the coupon defaults; cure funds the shortfall; non_kyc_transfer attempts a transfer to the outsider and returns the on-chain refusal (error name + tx/simulation logs); dvp_trade creates+admits+funds+settles a 5-bond trade at dirty price (clean 100 % + accrued) and returns `TradeAccrued`.
- `/series` public listing excludes sandboxes except the caller's own (by cookie).
- [ ] Tests with the fake CLI; rate-limit tests; mainnet-guard test.
- [ ] Commit `feat(registrar): one-click judge sandbox on a demo clock`.

**Acceptance:** tests green; on devnet (by 1540) a sandbox reaches maturity within 7 minutes with autopilot; `make verify` green.

## Lead notes (after 1521, 1522)
- Already on main: `series_settings.no_autofund` + `sandbox_id` (migration 007, task 1522) with `Store.SetSeriesNoAutofund` / `NoAutofundSeries`; the scheduler skips funding for flagged series, so `skip_funding` = set the flag and the autopilot declares the default after `executor.DefaultDue`. Your migration is therefore `008_sandboxes.sql`.
- `executor.NextStep` now takes the Series (hooked series snapshot from record_at without a strike); new steps `declare_default`, `confirm_bank_payout`.
- The web sandbox UI (1532, Opus) is being built against a typed client for exactly the three endpoints in this task; match its request/response shapes (`apps/web/src/lib` — look for the sandbox API types once 1532 merges, or ask the lead via reports/questions).
- Series REST already exposes `demoClock {daySecs, issueTs, issueDate}`, `hookGate`, `inDefault`; actions expose `defaultedAt`, `curedAt`, `bankPending`, `finalizedAt`.

## Finish
`make verify` green, commits carry `task: 1524`, `reports/worklog/1524.md` written. Print `DONE:1524` or `BLOCKED:1524 <reason>`.
