---
id: 91565
title: scheduler logs an unowned series once (inverted check), hide the devnet race-repro series
agent: flash
tier: T1
depends_on: [91563]
verify: make verify
timeout_min: 60
---
## Goal
Prod registrar logs `scheduler: skipping series the autopilot does not own …` for the same mints on every tick
(486 lines in 30 min). `services/registrar/internal/scheduler/scheduler.go:283-287`: `skipped(mint)` (line 213) returns
true the FIRST time and marks the mint, false afterwards; the caller logs on `!s.skipped(mint)` → logs every tick except the
first. Line 285 also writes `s.skippedMints` without `backoffMu`.

## Do
1. Caller: `if s.skipped(mint) { s.Log.Info(...) }`; delete line 285 (the helper already marks under the lock). Rename the
   helper to `firstSkip` so the meaning is obvious.
2. Test (scheduler package, table/unit style like the 91563 backoff tests): two ticks over one unowned series → exactly one
   "skipping series" log record (capture slog via a handler writing to a buffer).
3. `config/hidden-series.txt`: append under a comment `# devnet race repro (task 91562), not demo series` the mints
   `E1PDSX8zgAXnQSH2EagJsQGJzvHTtM5KDkNLRcg7GryJ`, `DpFfyxzo2oNqs8Jq483VPzGh66TjCHKQyywTrBtJKJVk`,
   `F4nwBwJvn16BVuCPNDyWCrAbsSRaDHBEDULv4LDDz5DJ`, `7PMh6hwbdBg3jhzZ7asaA2HdXqrqT7czcxnAJDGvdMuH` (tickers Race-915644..647, they
   show on the public board).
4. Do not deploy.

## Acceptance
New test green; `make verify` green. Commit `fix(registrar): log an unowned series once; hide race-repro series` (`task: 91565`).

## Finish
Write `reports/worklog/91565.md` (3–6 lines), commit with `task: 91565`, print `DONE:91565` or `BLOCKED:91565 <reason>`.
