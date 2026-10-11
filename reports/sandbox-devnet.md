# Judge sandbox end-to-end on devnet — shakeout log (task 91556)

Local registrar (`make api` with `SCHEDULER=1 AUTOFUND=1`, throw-away SQLite, real `ops/qupon` CLI, repo `.env` keys)
against Solana devnet, program `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`. Every signature below is a real devnet
transaction: `https://explorer.solana.com/tx/<sig>?cluster=devnet`.

## Bugs found and fixed

| # | Failure (verbatim from the API) | Root cause | Fix |
|---|---|---|---|
| 1 | `executor_failed: bank route Nomad Pension: cli payout:route refused: qupon: --bank-ref is required for the bank route` | `place()` called `payout:route --route bank` without `--bank-ref` | `sandbox.go` passes `--bank-ref SANDBOX-<ticker>-<label> (SIMULATED)` (only its sha256 goes on-chain) |
| 2 | `action:announce … InvalidDates (6007)` on every tick, forever | demo series shrank the record floor to one series-day = 1 s; the announce tx needs 10–20 s wall time to land and the program checks `now < record_at` at execution | `scheduler.Decide` keeps a wall-clock floor (`announceFloor` 60 s) for demo series; lead/delay stay in series-days |
| 3 | coupon paid, then the action stuck in `Settling`, `next.step = confirm_bank` forever | the bank-routed holder (Nomad Pension) awaits the paying agent's confirmation — a manual console action; an unattended sandbox could never pass coupon 1 | scheduler auto-confirms PaidToAgent entitlements **of sandbox-tied series only** with reference `SANDBOX-<series>-<index>-<owner8> (SIMULATED)`; real series keep the manual flow |
| 4 | `scenario_unavailable: no outsider wallet configured (QUPON_SANDBOX_OUTSIDER)` | production-style env exports `QUPON_OUTSIDER_KEYPAIR`, not `QUPON_SANDBOX_OUTSIDER` | `main.go` falls back to `QUPON_OUTSIDER_KEYPAIR` |
| 5 | `qupon: --keypair <path> (the sending holder) is required` | `sandbox:refuse` read the global `--keypair` from the action-params object, which misses globals in commander 15 (reproduced with a 6-line script: `opts.keypair = undefined`, `optsWithGlobals().keypair` set) | read it via `cmd.optsWithGlobals()` |
| 6 | kit invariant violation: `Switch statement non-exhaustive … getCommitmentScore(undefined)` | `sendTransactionWithoutConfirming` was called with `{skipPreflight:true}` but no `commitment` | pass `commitment: "confirmed"` |
| 7 | refusal reported as `TransactionFailed` with `logs: []` | `getTransaction` raced the indexer after the skipPreflight send | poll up to 10 × 1.5 s until the logs land (the page shows the real on-chain refusal) |
| 8 | `cli trade:fund refused: qupon: --side: expected seller or buyer, got 'bond'` | the scenario passed asset names as `--side` | `scenarios.go` passes `--side seller` (Dana escrows bonds) then `--side buyer` (Altyn pays dirty) |
| 9 | `GET /demo/sandbox/{id}` returned `"schedule": null` on every sandbox → the page's `s.schedule.map` crashes | `schedule()` mapped civil coupon dates to real Almaty midnights; on a 1 s-day series every coupon lands beyond the compressed maturity, so the loop broke at once | demo series map a civil date to `issue_ts + demo-days × day_secs`; labels show the demo civil date |

Also relaxed the live e2e assertion `5,000.00 clean` → `[\d,.]+ clean`: on chain the clean price depends on the accrued
days at click time (our run: 4,926.39 clean + 73.61 accrued = 5,000.00 dirty), so a fixed par-clean regex can only
match a trade placed exactly on a civil-day boundary.

## The flow that now works (sandbox `SBX-6TY7EW`, id `yr7zpxd2kt`)

| Step | Result | Devnet tx |
|---|---|---|
| `POST /demo/sandbox` | 201, series SBX-6TY7EW, 3 holders placed 10/25/65, schedule (2 coupons) in the response | series mint `9Yjz7Us8HurTD75FyFnHxgmCsrYxGfi6V8DH7WspXyhK` |
| announce INTR (demo clock, −5 series-days) | Announced | [5By8Levb…](https://explorer.solana.com/tx/5By8LevbFn8d8d9u99axNcca9C4FwB2dbrzVHG2wqwayaGdw8Vx6aXWCgjfVykJK9Rzma5mq7BgqgNsLARKXUjdg?cluster=devnet) |
| snapshot batches + finalize | 3 holders, 100 units | [BQqpcAbj…](https://explorer.solana.com/tx/BQqpcAbjaZc6vtTaRf4yR1SpfTmqUqyKS5i8Lpqbjk297FHiiTqPNzAxo7EzRZqrYADYZwcJHJfbWKpR9ttZka?cluster=devnet) · [3EGEY9UL…](https://explorer.solana.com/tx/3EGEY9UL8tRa4zMJW38K7DT5BuVNXTBmYRuH6gYcceqxkPinaDKKAn1M8EcA9ebyXNvuHfJGu2C7BhDEJmkttWBp?cluster=devnet) |
| fund (autofund, issuer cash) | escrow 5,250.00 tKZT | [4rmySXyY…](https://explorer.solana.com/tx/4rmySXyYvhcoVjDKWAqAWMRsywhzt4yX5A3oZQ9YCQNj8kZUpCDuPLqVy2d6z1TKsnFZgZriCAnkNa6YRgBsB1L8?cluster=devnet) |
| pay (wallet holders + PaidToAgent for the bank route) | 50.00 · 125.00 · 276.25 tKZT net (15 % withholding on the pension fund) | [fLZQshc6…](https://explorer.solana.com/tx/fLZQshc68q6VqxNMSKFjndunJ47a8oo2kzJtBKMyArBarmW8okDCrVhWuvDt7y8GXTWV46JsxBAYwtsUgHVwAFk?cluster=devnet) |
| **first coupon paid** → autopilot bank confirm | PaidToAgent → Paid | [5e1jagLH…](https://explorer.solana.com/tx/5e1jagLH6RRYpyfESCoNyYq44YR4hJYfbPrySk7UGduNvwT1Skw52GcELxE8JjPR2uVivmAxWC5s6UUZbVhPKzDa?cluster=devnet) |
| complete + sweep | action Completed | [2DQA7asK…](https://explorer.solana.com/tx/2DQA7asKgJStkcTm1BU5exgUsDXTHe4E2v2jxEc93bGWHa33iSr7Wy6hFEVKCg6Ha6Jrj8MLFZHSRuzHGQPMsnWC?cluster=devnet) |

## Scenarios (documented result → observed)

- **`skip_funding`** — funding off, next coupon defaults after the grace period → observed on `SBX-X7Z69U`: the
  redemption announced, record/snapshot ran unfunded, autopilot declared `ActionDefaulted` (store flag flip, no tx).
- **`cure`** — funds the defaulted action's shortfall, autopilot resumes → observed: `action:fund`
  [5Q9rNPyx…](https://explorer.solana.com/tx/5Q9rNPyxjtx3rTmrQeW31sr1xo59bqH31aaq1N9UMjLkDrPryS8wSDPULASBRJTdCfKK6wp6rkPWh8QL6fYtsKK6?cluster=devnet),
  then pay → retire → close: `SeriesClosed`
  [3JTGDtYo…](https://explorer.solana.com/tx/3JTGDtYoh81qEMZ7M7584FK797hTr8zKYAsCZ7GTowdaVoCurF6KJpNzz4jkooJLBnbwRoFC3KJ5tVLNtWcZ9Fvp?cluster=devnet).
- **`non_kyc_transfer`** — refused on-chain, failed tx still has a signature and logs → observed: transfer to the
  outsider lands and fails with Token-2022 `0x11` (AccountFrozen — the ATA stays frozen without registration):
  [28ZvdM58…](https://explorer.solana.com/tx/28ZvdM58Ub4Wj7t82LTrpoGCccDF5zrAeWUXrU3uRMBg1ugDqXruHqjavr8iK3P3c7ouswAK2iE9d8CsLxrkf8j7?cluster=devnet).
- **`dvp_trade`** — 5 bonds, clean + accrued = dirty, 4 transactions → observed: 492,639 + 7,361 = 500,000 minor
  (53 accrual days, 30E/360), sigs create/fund×2/settle, first:
  [4Ra2wdCf…](https://explorer.solana.com/tx/4Ra2wdCftgZjrD88yYwcEu7j1hCdsDXwwsLkD6ptxLcqWhoKuPPANwTbC974fr5jYLKKXodgfk6u2D12J1V2XSDB?cluster=devnet).

Note: `dvp_trade` must run **before** a coupon's record date arms (the register locks from record to payment —
`RecordLocked (6037)`, by design); on a fresh sandbox that is a ~3-minute window after creation, and the whole
coupon period repeats every ~3 series-months.

## CI now catches all of it

`fake-cli.sh` (used by the sandbox/scheduler/executor tests) validates argv like the real CLI: `--bank-ref` required
for/only for the bank route, `trade:fund --side seller|buyer`, `sandbox:refuse --keypair`, `payout:confirm-bank
--owner/--reference`, and `asset:faucet --mint` against a `FAKE_CLI_ASSETS` allow-list (config `testAssets`), plus the
existing KYC attest/register match. Tests assert the new argv (`--bank-ref SANDBOX-…`, `asset:faucet --mint tKZT`,
the confirm-bank reference) and `TestTickSandboxBankConfirm` covers the auto-confirm (and that real series are left
alone).
