---
id: 1524
title: sandbox API — a judge's own bond on a demo clock
blocked_reason: lead rebuilding the resume patch (a restart captured a half-deleted worktree)
agent: glm
tier: T0
depends_on: [1520, 1522]
verify: make verify
timeout_min: 180
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

## The web contract (task 1532, merged) — implement exactly this
- Source of truth: `apps/web/src/lib/sandbox.ts` (types) and `apps/web/src/mocks/features/sandbox.ts` (a mock autopilot that
  replays the expected states; copy its state progression). Add the same shapes to openapi.yaml (both copies).
- `POST /demo/sandbox` `{wallet?, requestId}` → 201 `{id, mint, ticker, clock:{daySecs, issueTs}, schedule, links}`;
  errors 429 `demo_throttled`, 400 `bad_wallet`. Idempotent per `requestId`. Set the `qupon_sandbox` cookie value = id.
- `GET /demo/sandbox/{id}` → `{id, clock, serverTime, expiresAt, wallet, autofund, series, schedule, actions, holders[],
  entitlements, next:{step, actor, at}, activity, scenarios[], links}`; 404 `sandbox_not_found`. Actions may be
  `Defaulted` (`defaultedAt`, `curedAt`, `bankPending`); entitlements may be `PaidToAgent`. All times are real instants.
- `POST /demo/sandbox/{id}/scenario` `{kind}` → `{kind, at, signatures, error?, logs?, trade?}` (`trade` = TradeAccrued
  fields); 409 `scenario_unavailable`.
- The web proxy calls these without a session and forwards `X-Forwarded-For` and the sandbox cookie. Rate-limit on the
  LAST `X-Forwarded-For` entry (the one Caddy appends) — never the first, which the visitor controls.
- Send the `non_kyc_transfer` attempt with skipPreflight so the refusal has a signature + logs.
- When a visitor wallet joined, leave that holder's payout unpaid for ~60 s after funding so the page's Claim button has a
  window (the autopilot pays everyone else immediately).

## Resume notes (lead, 2026-10-10 00:27)
- The resume patch `logs/1524-go-sandbox-api.20261010-002639.wip.patch` (applied automatically) holds most of the
  implementation: `internal/sandbox`, `internal/api/sandbox.go` + tests, `store/sandboxes.go`, migration
  `009_sandboxes.sql` (008 is taken by 91522 — keep 009), network guard, scheduler hooks, CLI helpers. It was stopped
  while writing the openapi additions. Finish: openapi (both copies identical) → `cd apps/web && pnpm gen`; make every
  package compile; `go test ./services/registrar/...`; golangci-lint; then `make verify`. Rebase on main first if the
  patch does not apply cleanly (91522 and 1525 changed api.go, rest.go, openapi.yaml).

## Finish
`make verify` green, commits carry `task: 1524`, `reports/worklog/1524.md` written. Print `DONE:1524` or `BLOCKED:1524 <reason>`.

## Review feedback (round 1, 2026-10-10 10:21) — fix every blocking item first; your previous work is already committed on this branch

### Summary
This is a solid implementation that is not usable as shipped. The sandbox service, store, migration 009, scheduler claim window, `sandbox:refuse` CLI command (skipPreflight), `/series` cookie filter and mainnet guard test all follow the plan and the 1532 web contract closely. Three things block the merge. First, `cmd/registrar/main.go` never builds a `sandbox.Service`, so every `/demo/sandbox*` route returns 503 in production and the devnet acceptance can't be met. Second, dvp_trade returns bare integers where the web and openapi expect Amount objects; `panels.tsx` calls `BigInt(tr.accrued.minor)`, which throws on a real backend, and the test doesn't assert the money fields. Third, the rollback test never exercises rollback. No program, money-math or secrets problems. My test runs were denied by the permission mode, so this verdict relies on the orchestrator's green `make verify`. No web UI changed (only the generated schema), so I skipped the screenshot pass.

### Blocking
- services/registrar/cmd/registrar/main.go:189 — `Deps.Sandbox` is never built. No `sandbox.Service` is constructed anywhere outside the tests (grep for `sandbox.` and `Sandbox:` in non-test Go finds only the field declaration in api.go:67). The deployed registrar therefore answers 503 `sandbox_off` on all three `/demo/sandbox*` routes. That fails the acceptance criterion (on devnet a sandbox must reach maturity within 7 minutes under autopilot). The 'configurable' limits are also not configurable in practice, because nothing ever sets `Limits`.
  **Fix:** In main.go, after `deps := api.Deps{...}`, wire the service when `exec != nil && chainClient != nil && !profile.Mainnet`: `deps.Sandbox = &sandbox.Service{Exec: exec, Store: st, Read: chainClient /* or readModel(chainClient) if that is what satisfies sandbox.Reader */, BaseConfig: cfg.QuponConfig, Log: logger, Limits: sandbox.Limits{PerIPPerHour: envInt("QUPON_SANDBOX_PER_IP_HOUR", 3), PerDay: envInt("QUPON_SANDBOX_PER_DAY", 30)}}`. Log a warning when the sandbox is enabled but the scheduler is off (`!cfg.Scheduler && !cfg.DemoSpeed`), because without the autopilot a sandbox never advances. Document `QUPON_SANDBOX_HOLDERS`, `QUPON_SANDBOX_INVESTOR<i>_KEYPAIR`, `QUPON_SANDBOX_OUTSIDER` and the two limit vars in `.env.example` and `docs/04-stack.md`.
- services/registrar/internal/sandbox/sandbox.go:577 — dvp_trade returns `trade.clean`, `trade.accrued` and `trade.cash` as bare int64 numbers. The web contract it was told to match exactly expects `Amount` objects `{minor, display, currency}`: see `apps/web/src/lib/sandbox.ts` TradeAccrued, the PR's own openapi.yaml `TradeAccrued` (which `$ref`s Amount), and the mock (`amount(t.clean)`). `apps/web/src/app/(public)/sandbox/[id]/panels.tsx:222-223` reads `tr.cash.minor` and calls `BigInt(tr.accrued.minor)`, so on a real backend `BigInt(undefined)` throws. The scenario card crashes, and so does every later GET, because the stored detail is replayed in `scenarios[]`. Separately, `TestScenarios` claims '5 bonds at clean + accrued' but never asserts any of the three money fields.
  **Fix:** In `dvpTrade`, emit Amounts. Add `func amountOf(minor int64, currency string) map[string]string { return map[string]string{"minor": strconv.FormatInt(minor, 10), "display": <minor/100 with 2 decimals, sign kept> + " " + currency, "currency": currency} }`, using `currency := chain.CashCurrency(series.CashMint)`. Set `"clean": amountOf(int64(create.Clean), cur), "accrued": amountOf(int64(create.Accrued), cur), "cash": amountOf(int64(create.CashAmount), cur)`, and keep `units` as a string. Use the same display format as the api package's `money.amount` so the two stay in sync. In `TestScenarios`, assert `trade.Trade["clean"].(map[string]string)["minor"] == "500000"`, accrued minor == `"2083"`, cash minor == `"502083"` and cash == clean + accrued. Add one api-level dvp_trade POST in `sandbox_test.go` (the fake CLI needs a `trade:create` case) that decodes `trade.cash.minor`.
- services/registrar/internal/sandbox/sandbox_test.go:218 — `TestCreateRollsBackOnCliRefusal` does not test what its name claims. It makes `holders()` error out before any CLI command runs, sets an env var the fake ignores (its own comment says so), and checks only that no sandbox row exists. The real rollback path, `s.rollback` (registry row deleted, executor config rewritten after a CLI refusal mid-setup), is never exercised.
  **Fix:** Make the fake CLI honour `FAKE_CLI_FAIL=<cmd>` (when `$cmd` equals it, echo `{"ok":false,"error":"boom"}`). Set it to `issue` and call Create. Assert `errors.Is(err, ErrExecutor)`, that `Store.ListRegistry` has no row whose name starts with `SBX-`, that `os.ReadFile(svc.Exec.ConfigPath())` no longer contains the ticker, and that `CountSandboxesSince("", 0) == 0`. Keep the missing-holders case as a separate, honestly named test.

### Acceptance criteria not met
- Limits 3 per IP per hour, 30 per day, configurable; keyed on the LAST X-Forwarded-For entry — Throttle logic plus TestSandboxRateLimitUsesLastForwardedFor exist (clientIP takes parts[len-1]), but Limits is never set outside tests, so the limits are not configurable in the deployed service.
- Scenarios skip_funding / cure / non_kyc_transfer (skipPreflight, error + logs + signature) / dvp_trade (TradeAccrued); 409 scenario_unavailable — skip_funding, cure and non_kyc_transfer are implemented and tested (sandbox:refuse sends with skipPreflight: true). dvp_trade returns int64 amounts instead of the contract's Amount objects (blocking #2).
- On devnet a sandbox reaches maturity within 7 min with autopilot — Impossible as shipped: Deps.Sandbox is nil in main.go, so every endpoint returns 503.
