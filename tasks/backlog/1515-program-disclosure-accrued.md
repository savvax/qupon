---
id: 1515
title: program — disclosure anchoring and accrued interest on DvP trades
agent: glm
tier: T1
depends_on: [1514]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1515 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs

## Plan section
### Task 1515: program — disclosure anchoring and accrued interest on DvP trades

**Agent:** glm · **Depends on:** 1514 · **Role:** anchor

**Files:** `state.rs` (CorporateAction `disclosure_hash: [u8; 32]` → `reserved: [u8; 11]`), new `instructions/disclosure.rs` (`attach_disclosure(hash)`, registrar, once per action, any status except Cancelled), `trade.rs` (`admit_trade` emits `TradeAccrued`), `events.rs` (`DisclosureAttached { series, action, index, hash, … }`, `TradeAccrued { series, swap_dvp, units, cash_amount, settle_ymd: u32, accrued_days: i32, accrued: i64, clean: i64, slot, timestamp }`), `error.rs` (append `AlreadyAttached`), CLI `disclosure:attach`, tests `tests/disclosure.rs`, `tests/trade.rs` (new cases only).

- [ ] **Step 1: failing tests**:

```rust
#[test] fn disclosure_attaches_once() {
    let (mut env, b, _h, a) = intr_announced();
    env.send(&[attach_ix(&b, &a, [5; 32])], &[&b.registrar]).unwrap();
    assert_eq!(fetch_action(&env, &a).disclosure_hash, [5; 32]);
    assert_err(env.send(&[attach_ix(&b, &a, [6; 32])], &[&b.registrar]).unwrap_err(), "AlreadyAttached");
}
#[test] fn trade_30_days_into_period_carries_accrued() {
    let (mut env, b, h) = registered_with_units();
    env.set_clock(period_start_plus_one_month(&b) + 3600); // 2026-07-03 → 2026-08-03 = 30 days in 30E/360 (not +30 calendar days, which is 29)
    admit_trade_for(&mut env, &b, &h[2], &h[0], 5, 504_167);
    let ev = env.last_event::<TradeAccrued>();
    assert_eq!((ev.accrued_days, ev.accrued, ev.clean), (30, 4_167, 500_000));
}
#[test] fn trade_in_ex_coupon_window_has_negative_accrued() {
    let (mut env, b, h, a) = intr_snapshotted(); // resumed after finalize, record date = last day of the period
    admit_trade_for(&mut env, &b, &h[2], &h[0], 10, 999_722);
    let ev = env.last_event::<TradeAccrued>();
    assert_eq!((ev.accrued_days, ev.accrued, ev.clean), (-1, -278, 1_000_000));
}
```

- [ ] **Step 2: implement** — accrual start: if `series.open_action` is an INTR action with status in `{RecordStruck, SnapshotComplete, Funded, Settling, Defaulted}` → that action's `period_end` (ex-coupon), else `series.period_start`; `settle = clock.floor_civil(now)`; `(accrued, days) = entitlement::accrued_signed(units, face, rate, dc, start, settle)`; `clean = cash_amount as i64 − accrued`. Pass the open action as an optional account to `admit_trade` (CLI passes `series.open_action` when set; program requires it to match `series.open_action`).
- [ ] **Step 3:** CLI (`trade:create` prints `accrued`, `clean`), codama, docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): anchor disclosure hash; accrued interest on admitted trades` (`task: 1515`).

**Acceptance:** 3 tests pass; values equal `fixtures/entitlement.json` `accrued_cases`; size test unchanged; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1515`, `reports/worklog/1515.md` written. Print `DONE:1515` or `BLOCKED:1515 <reason>`.
