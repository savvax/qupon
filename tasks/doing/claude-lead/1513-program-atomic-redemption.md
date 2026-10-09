---
id: 1513
title: program — atomic pay + burn at redemption; 5-account pay layout
agent: claude
tier: T0
depends_on: [1512]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1513 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1513: program — atomic pay + burn at redemption; 5-account pay layout

**Agent:** glm · **Depends on:** 1512 · **Role:** anchor

**Files:** `settle.rs` (`PayBatch` gains `mint` (mut), `bond_token_program: Program<Token2022>`; remaining accounts per holder = `[Entitlement (w), Investor, PayoutRoute PDA (read; may be uninitialised), destination cash ATA (w), bond ATA (w)]`; `PAY_BATCH_MAX = 5`), `state.rs` (no layout change; add `PAYOUT_ROUTE_SEED = b"route"` to constants), `retire.rs` unchanged (strays only), `clients/ts/src/commands/action.ts` (pay builder, batch size 4, CU limit 400k), Go `executor` unaffected (CLI builds accounts), tests `tests/redemption.rs`, `tests/cu_benchmarks.rs`, docs.

- [ ] **Step 1: failing tests** in `tests/redemption.rs`:

```rust
#[test] fn redemption_pays_and_burns_in_one_instruction() {
    let (mut env, b, h, r) = redm_funded();
    pay_all_as_outsider(&mut env, &b, &r, &h);
    assert_eq!(cash_balances(&env, &h), vec![1_050_000, 2_625_000, 6_825_000]); // principal + final coupon
    assert_eq!(mint_supply(&env, &b), 0);
    for e in fetch_entitlements(&env, &r) { assert_eq!(e.status, EntitlementStatus::Retired as u8); }
    // hooked: register stays locked by the gate; legacy variant of this test asserts the mint is paused again
    complete_as_outsider(&mut env, &b, &r);
    close_series(&mut env, &b, &r).expect("supply already 0");
}
#[test] fn suspended_holder_is_thawed_burned_and_paid() {
    let (mut env, b, h, r) = redm_funded();
    suspend(&mut env, &b, &h[1]);
    pay_all_as_outsider(&mut env, &b, &r, &h);
    assert_eq!(token_balance(&env, &h[1].bond_ata), 0);
    assert_eq!(cash_balance(&env, &h[1]), 2_625_000);
}
#[test] fn pay_rejects_wrong_route_pda() {
    let (mut env, b, h, a) = intr_funded();
    let err = env.send_as_outsider(pay_ix_with_route(&b, &a, &h[0], &Pubkey::new_unique())).unwrap_err();
    assert_err(err, "InvalidParams");
}
#[test] fn coupon_does_not_burn() {
    let (mut env, b, h, a) = intr_funded();
    pay_all_as_outsider(&mut env, &b, &a, &h);
    assert_eq!(mint_supply(&env, &b), 100);
}
```

- [ ] **Step 2: implement** — in `handle_pay_batch`: `require!(rem.len().is_multiple_of(5))`; per holder verify `t[2].key() == find_program_address([PAYOUT_ROUTE_SEED, investor.key()])`, `t[3] == investor.cash_ata` (1514 adds the bank branch), `t[4] == investor.bond_ata`; for `Redemption | EarlyRedemption` — hooked series: the register is already locked by the gate and a permanent-delegate burn does not invoke the hook, so no pause dance; legacy series: once per batch `pausable_resume` (series PDA signer) — then per holder after the cash transfer: if the bond ATA is frozen `thaw_account` (series PDA = freeze authority), `burn_checked(ent.units)` with the series PDA as permanent delegate, `ent.status = Retired`, `action.total_retired += units`, `action.holders_retired += 1`, emit `UnitsRetired`; legacy only: at the end of the batch `pausable_pause`. `complete_action` reconciliation unchanged; for REDM/MCAL → `Retiring` (supply already 0) — `close_series` requirement `holders_retired == holders_snapshotted` holds.
- [ ] **Step 3:** CLI pay builder passes 5 accounts/holder and the new fixed accounts; `cu_benchmarks` asserts ≤ 400k CU for a 5-holder REDM batch; codama; docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): atomic pay+burn for redemptions; payout-route slot in pay_batch` (`task: 1513`).

**Acceptance:** 4 tests pass; existing redemption/retire/close tests adjusted ONLY where they built the 3-account layout (list them in the worklog); `make verify` green.

## Finish
`make verify` green, commits carry `task: 1513`, `reports/worklog/1513.md` written. Print `DONE:1513` or `BLOCKED:1513 <reason>`.
