---
id: 1512
title: program — default and cure
agent: glm
tier: T0
depends_on: [1511]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1512 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs

## Plan section
### Task 1512: program — default and cure

**Agent:** glm · **Depends on:** 1511 · **Role:** anchor

**Files:** `state.rs` (ActionStatus `Defaulted = 10`; CorporateAction `defaulted_at: i64, cured_at: i64` → `reserved: [u8; 47]`; Series `in_default: u8, defaults_count: u16` → `reserved: [u8; 49]`), new `instructions/default.rs`, `settle.rs` (`fund_action`), `lib.rs`, `events.rs` (`ActionDefaulted`, `DefaultCured`), `error.rs` (append `NotOverdue`), CLI `action:default` in `clients/ts/src/commands/action.ts`, tests `tests/default.rs`, docs 02/03 (§ "Default and cure").

**Interfaces — Produces:** `declare_default()` accounts `{ payer: Signer, series (mut), action (mut, has_one series, has_one escrow), escrow }`; events `ActionDefaulted { series, action, index, kind, required, escrow_balance, shortfall, payment_at, defaulted_at, slot, timestamp }`, `DefaultCured { series, action, index, late_secs, slot, timestamp }`.

- [ ] **Step 1: failing tests** `tests/default.rs`:

```rust
#[test] fn default_needs_payment_date_plus_grace() {
    let (mut env, b, _h, a) = intr_snapshotted_unfunded();
    env.set_clock(a.payment_at + grace(&b) - 1);
    assert_err(env.send_as_outsider(declare_default_ix(&b, &a)).unwrap_err(), "NotOverdue");
}
#[test] fn outsider_declares_default_and_bond_keeps_trading() {
    let (mut env, b, h, a) = intr_snapshotted_unfunded();
    fund_partial(&mut env, &b, &a, 100_000);
    env.set_clock(a.payment_at + grace(&b));
    env.send_as_outsider(declare_default_ix(&b, &a)).unwrap();
    let (act, s) = (fetch_action(&env, &a), fetch_series(&env, &b));
    assert_eq!(act.status, ActionStatus::Defaulted as u8);
    assert_eq!((s.in_default, s.defaults_count), (1, 1));
    let ev = env.last_event::<ActionDefaulted>();
    assert_eq!((ev.required, ev.escrow_balance, ev.shortfall), (500_000, 100_000, 400_000));
    env.send(&[transfer_ix(&b, &h[2], &h[0], 65)], &[&h[2].kp]).expect("trades while in default");
}
#[test] fn funded_action_cannot_default() {
    let (mut env, b, _h, a) = intr_snapshotted_unfunded();
    fund_full(&mut env, &b, &a);
    env.set_clock(a.payment_at + grace(&b));
    assert_err(env.send_as_outsider(declare_default_ix(&b, &a)).unwrap_err(), "WrongStatus");
}
#[test] fn cure_pays_record_date_holders_not_buyers() {
    let (mut env, b, h, a) = intr_defaulted();
    env.send(&[transfer_ix(&b, &h[2], &h[0], 65)], &[&h[2].kp]).unwrap(); // holder 3 sells after the default
    fund_full(&mut env, &b, &a);
    let ev = env.last_event::<DefaultCured>();
    assert!(ev.late_secs > 0);
    assert_eq!(fetch_series(&env, &b).in_default, 0);
    pay_all_as_outsider(&mut env, &b, &a, &h);
    assert_eq!(cash_balances(&env, &h), vec![50_000, 125_000, 325_000]);
}
#[test] fn redemption_default_keeps_register_frozen() {
    let (mut env, b, _h, r) = redm_snapshotted_unfunded();
    env.set_clock(r.payment_at + grace(&b));
    env.send_as_outsider(declare_default_ix(&b, &r)).unwrap();
    assert!(mint_paused(&env, &b.mint));
}
#[test] fn no_new_action_while_defaulted() {
    let (mut env, b, _h, _a) = intr_defaulted();
    assert_err(announce_next(&mut env, &b).unwrap_err(), "ActionAlreadyOpen");
}
```

- [ ] **Step 2: implement** `instructions/default.rs`:

```rust
pub fn handle_declare_default(ctx: Context<DeclareDefault>) -> Result<()> {
    let clock = Clock::get()?;
    let required = required_funding(&ctx.accounts.action)?;
    let a = &ctx.accounts.action;
    require!(a.status == ActionStatus::SnapshotComplete as u8, QuponError::WrongStatus);
    let due = a.payment_at.checked_add(SeriesClock::of(&ctx.accounts.series)?.grace()).ok_or(QuponError::MathOverflow)?;
    require!(clock.unix_timestamp >= due, QuponError::NotOverdue);
    let balance = ctx.accounts.escrow.amount;
    require!(balance < required, QuponError::WrongStatus);
    let a = &mut ctx.accounts.action;
    a.status = ActionStatus::Defaulted as u8;
    a.defaulted_at = clock.unix_timestamp;
    let s = &mut ctx.accounts.series;
    s.in_default = 1;
    s.defaults_count = s.defaults_count.checked_add(1).ok_or(QuponError::MathOverflow)?;
    emit!(ActionDefaulted { series: s.key(), action: a.key(), index: a.index, kind: a.kind, required,
        escrow_balance: balance, shortfall: required - balance, payment_at: a.payment_at,
        defaulted_at: clock.unix_timestamp, slot: clock.slot, timestamp: clock.unix_timestamp });
    Ok(())
}
```

  `fund_action`: accept `Defaulted`; when the balance reaches `required` and the prior status was `Defaulted`: `cured_at = now`, `series.in_default = 0`, emit `DefaultCured { late_secs: now − payment_at }`, status `Funded` (FundAction gets `series` as `mut`).
- [ ] **Step 3:** CLI `action:default --series --index` (any keypair; `--keypair` optional) → `{ok, signature}`; codama; docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): permissionless declare_default and cure by funding` (`task: 1512`).

**Acceptance:** 6 tests pass; size test unchanged; `NotOverdue` appended last; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1512`, `reports/worklog/1512.md` written. Print `DONE:1512` or `BLOCKED:1512 <reason>`.
