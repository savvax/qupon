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

## Review feedback (round 1, 2026-10-12 02:01) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The scheduler fix and its test are correct and match the task. The `config/hidden-series.txt` edit is a regression. Instead of appending, it deleted two existing hidden mints (`RkrnvkpU…` and `WggU16…`) and duplicated `HuHG43…`, so two series that should stay hidden show on the public board again. I could not run the scheduler tests myself because Bash test execution was denied in this session, so the green result rests on the orchestrator's `make verify`. Restore the two deleted lines and the branch can merge.

### Blocking
- config/hidden-series.txt:58 — The diff deletes two mints that were already hidden at the base commit, `RkrnvkpU2m1wL6RUsbgqd99ybND1im3gRSjc2JKq1Zt` and `WggU16duePpgouSdoTYhURtK34TFF7oHCWjn8pHxE6g`, and adds a duplicate `HuHG43AN8HP2bB2DDqfqZd4bFeuMSGqFk7nCbJodpckW` in their place. The task only asked to append. As committed, two series that should stay hidden reappear on the public board.
  **Fix:** Restore the base tail of the file: change line 58 `HuHG43AN8HP2bB2DDqfqZd4bFeuMSGqFk7nCbJodpckW` back to the two lines `RkrnvkpU2m1wL6RUsbgqd99ybND1im3gRSjc2JKq1Zt` and `WggU16duePpgouSdoTYhURtK34TFF7oHCWjn8pHxE6g`. Keep the blank line, the `# devnet race repro (task 91562), not demo series` comment and the four new mints after them. Check with `git diff 7ad1df31..HEAD -- config/hidden-series.txt`: it should show only added lines.

### Acceptance criteria not met
- hidden-series.txt: the four race-repro mints are appended under the required comment — The comment and all four mints were added, but the same edit deleted two existing hidden mints and duplicated `HuHG43…`, so the change is not an append.
