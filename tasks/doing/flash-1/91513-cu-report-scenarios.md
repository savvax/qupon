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
