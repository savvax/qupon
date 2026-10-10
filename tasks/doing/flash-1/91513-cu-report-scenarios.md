---
id: 91513
title: CU report — separate legacy and hooked scenarios (no negative marginals)
agent: flash
tier: T1
depends_on: [91512]
verify: make verify
timeout_min: 120
---
## Goal
`reports/cu-benchmarks.md` (task 91512) mixes scenarios in one table: `snapshot_batch` with 5 holders (53,861 CU) is
cheaper than with 4 (62,218 CU), so the "Marginal CU per holder" column shows −8,357 — it reads as a bug to a judge.

## Read first
- programs/qupon_bonds/tests/cu_benchmarks.rs (the report writer, `QUPON_CU_REPORT=1`), reports/cu-benchmarks.md

## Do
- Give every measured row a `scenario` label (e.g. `legacy pause`, `hooked gate`, `wallet route`, `bank route`,
  `redemption pay+burn`) and compute "marginal CU per holder" only between consecutive rows of the SAME instruction and
  scenario (empty otherwise). Group the table by instruction, then scenario, holders ascending.
- Regenerate the report with `QUPON_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks`. Do not change program
  code or the budgets' asserted values beyond what the new grouping needs.

## Acceptance
No negative marginal value in the report; `cargo test -p qupon_bonds --test cu_benchmarks` green; `make verify` green.
Commit `test(program): CU report grouped by scenario` (`task: 91513`).

## Finish
Write `reports/worklog/91513.md` (3–6 lines), commit with `task: 91513`, print `DONE:91513` or `BLOCKED:91513 <reason>`.

## Review feedback (round 1, 2026-10-10 12:50) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The scenario column, the same-scenario marginal and the grouping are implemented correctly, the test is green, and program code and budgets are untouched. The worker correctly found that the −8,357 came from random-key noise between independent flows, not from mixing scenarios. But the fix only deletes the one unlucky snapshot ×5 row. Every other marginal still compares single random-key draws: a rerun moved pay_batch 4→5 from 10,313 to 3,792, and the same 5-holder scenario spans about 22k CU across runs. So the next regeneration can bring the negative back. Required fix: take the cheapest of 5 draws per batch size, restore the dropped row, and update the Method notes.

### Blocking
- programs/qupon_bonds/tests/cu_benchmarks.rs:709 — The fix works only for this one random draw; it doesn't remove the cause. The worker's diagnosis is right: all old snapshot rows were the same 'plain' scenario, and the −8,357 came from comparing two independent flows built with random keys. But the patch only drops the snapshot ×5 row (so a measured row is now missing). Every pair that still feeds a marginal (pay_batch 1/4/5, pay_batch worst case 1/4/5, retire_batch 1/5/12) is still a single random-key draw per size, so the noise is still there. I re-ran `cargo test -p qupon_bonds --test cu_benchmarks -- --nocapture` once. The pay_batch legacy 4→5 marginal came out at 3,792, against 10,313 in the committed report. The 5-holder wallet-route pay has measured 49,197, 53,697, 55,197, 61,197 and 71,697 across runs and tables, a spread of about 22k against a marginal of about 8k. Any regeneration of this 'do not edit by hand' report can bring back a negative marginal, which is the defect the task exists to remove. The comment on lines 590–591 also overclaims ('never produces a negative number').
  **Fix:** In `batches_stay_inside_the_compute_limits`, take the cheapest of 5 draws for every batch size. This is the same rule the file already uses for `set_payout_route`. (1) Replace `[1, CLI_PAY_BATCH, PAY_BATCH_MAX, SNAPSHOT_BATCH_MAX].map(|n| (n, flow(n, false, worst)))` with a per-size `(n, min snapshot, min pay)` taken over `(0..5).map(|_| flow(n, false, worst))`. Keep one plain `flow(CLI_PAY_BATCH, false, false)` for `single`, which supplies strike/finalize/fund/complete and the env for `spl_token_build`. (2) Inside the retire loop, take `retire_cu` as the min over 5 `retire(n, frozen)` draws, and take `redemption_pay` from the same draws. (3) Put the snapshot sizes back to all four `[1, CLI_PAY_BATCH, PAY_BATCH_MAX, SNAPSHOT_BATCH_MAX]`: delete the `.contains(n)` filter and the comment on lines 709–710. (4) Change the Method bullets: say that batch rows are the cheapest of 5 random-key draws, and delete 'The `pay_batch` rows keep their single draw'. Reword the comment on lines 590–591 so it doesn't claim 'never'. (5) Run `cargo test -p qupon_bonds --test cu_benchmarks -- --nocapture` 5 times and confirm no marginal is negative in any run. Then regenerate with `QUPON_CU_REPORT=1` and commit. The test runs in about 1.7 s, so ×5 draws costs about 8 s.

### Acceptance criteria not met
- The fix keeps the report free of negatives when regenerated (task goal: the report must not read as a bug to a judge) — Batch rows are still single random-key draws, and only one noisy row was dropped. In a rerun, pay_batch 4→5 moved from 10,313 to 3,792, and the same 5-holder scenario ranged from 49,197 to 71,697 CU.

Design score: 0/10
