---
id: 1514
title: program — holder payout route and bank confirmation
agent: glm
tier: T1
depends_on: [1513]
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1514 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs
- programs/qupon_bonds/tests/hook.rs (transfer-hook gate, spike 1509)

## Plan section
### Task 1514: program — holder payout route and bank confirmation

**Agent:** glm · **Depends on:** 1513 · **Role:** anchor

**Files:** `state.rs` (new account `PayoutRoute { bump: u8, investor: Pubkey, route: u8, bank_ref_hash: [u8; 32], updated_at: i64 }`, `PayoutRouteKind { Wallet = 0, Bank = 1 }`, `EntitlementStatus::PaidToAgent = 3`, CorporateAction `bank_pending: u32` → `reserved: [u8; 43]`), new `instructions/payout_route.rs` (`set_payout_route`, `confirm_bank_payout`), `settle.rs` (bank branch; `complete_action` requires `bank_pending == 0`), `events.rs` (`PayoutRouteSet`, `PaidToAgent`, `BankPayoutConfirmed`), `error.rs` (append `BankPayoutsPending`), CLI `payout:route`, `payout:confirm-bank`, tests `tests/payout_route.rs`, docs (bank transfer = SIMULATED, reference hash only).

- [ ] **Step 1: failing tests**:

```rust
#[test] fn only_the_holder_can_set_route() {
    let (mut env, b, h) = registered();
    assert_err(env.send_as(&b.registrar, set_route_ix(&b, &h[0], Bank, [7; 32])).unwrap_err(), "Unauthorized");
    env.send(&[set_route_ix(&b, &h[0], Bank, [7; 32])], &[&h[0].kp]).unwrap();
}
#[test] fn bank_route_pays_agent_and_needs_confirmation_before_complete() {
    let (mut env, b, h, a) = intr_funded_with_route(1 /*holder index*/, Bank);
    pay_all_as_outsider(&mut env, &b, &a, &h); // holder 1's net goes to the paying agent's cash ATA
    assert_eq!(cash_balance_of(&env, &b.paying_agent_cash_ata), 125_000);
    assert_err(complete_as_outsider(&mut env, &b, &a).unwrap_err(), "BankPayoutsPending");
    env.send(&[confirm_bank_ix(&b, &a, &h[1], [9; 32])], &[&b.paying_agent]).unwrap();
    complete_as_outsider(&mut env, &b, &a).unwrap();
    assert_eq!(env.last_event::<BankPayoutConfirmed>().reference_hash, [9; 32]);
}
#[test] fn bank_route_cannot_point_elsewhere() {
    let (mut env, b, h, a) = intr_funded_with_route(0, Bank);
    let err = env.send_as_outsider(pay_ix_with_dest(&b, &a, &h[0], &h[0].cash_ata)).unwrap_err();
    assert_err(err, "AccountOwnerMismatch");
}
#[test] fn only_paying_agent_confirms() {
    let (mut env, b, h, a) = intr_paid_to_agent(0);
    assert_err(env.send_as(&b.registrar, confirm_bank_ix(&b, &a, &h[0], [1; 32])).unwrap_err(), "Unauthorized");
}
```

- [ ] **Step 2: implement** — `set_payout_route(route: u8, bank_ref_hash: [u8;32])`: signer `owner` == `investor.owner`; create the PDA with `create_pda_account` if empty (payer = owner) else update; `route == Wallet` requires `bank_ref_hash == [0;32]`. `pay_batch`: if the route PDA is initialised and `route == Bank` → destination must equal `get_associated_token_address_with_program_id(series.paying_agent, cash_mint, cash_token_program)` → status `PaidToAgent`, `bank_pending += 1`, emit `PaidToAgent`; `holders_paid`/`total_paid` count it (money left the escrow). `confirm_bank_payout(reference_hash)`: signer == `series.paying_agent`; `PaidToAgent → Paid`, `bank_pending -= 1`, emit. `complete_action`: `require!(action.bank_pending == 0, BankPayoutsPending)`.
- [ ] **Step 3:** CLI + codama + Go decoder for `PayoutRoute` (new decoder, own discriminator) + docs; `make verify`.
- [ ] **Step 4: commit** `feat(program): holder-signed payout route and bank payout confirmation` (`task: 1514`).

**Acceptance:** 4 tests pass; nobody but the holder can choose bank; nothing but the agent's own cash ATA can receive a bank-routed payout; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1514`, `reports/worklog/1514.md` written. Print `DONE:1514` or `BLOCKED:1514 <reason>`.
