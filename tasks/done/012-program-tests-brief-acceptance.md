---
id: 012
title: Acceptance test suite named after the brief + negative paths + clock control
agent: claude
tier: T0
depends_on: [011]
verify: make verify
timeout_min: 45
---
## Goal
Make the on-chain test suite the proof for judges: one test per sentence of the brief's example, negative paths, and deterministic clock control.

## Read first
- docs/00-brief.md (worked example)
- programs/qupon_bonds/tests

## Steps
1. `tests/brief.rs`: `coupon_10_bonds_is_500`, `three_holders_sum_to_supply_times_coupon`, `redemption_pays_principal_plus_final_coupon` (can be a placeholder until task 015 lands — mark `#[ignore]` ONLY with a TODO referencing 015 and un-ignore there), `unregistered_wallet_cannot_hold`, `record_date_before_time_rejected`, `paused_mint_blocks_transfer`, `rerun_batches_is_noop`, `underfunded_escrow_rejected`.
2. Helper `fast_forward(svm, seconds)` setting the Clock sysvar.
3. Add `make test-program` output to `reports/test-report.md` via a script (`cargo test -- --format` pretty) — optional if time.

## Acceptance criteria
- [ ] All tests green, names readable in `cargo test` output; README (task 036) will reference them.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/012.md`, then print exactly `DONE:012` or `BLOCKED:012 <reason>`.
