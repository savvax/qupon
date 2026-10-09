---
id: 1510
title: program — exact record date, trustless crank, set hash
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 90
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1510 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/02-architecture.md
- docs/03-domain.md
- programs/qupon_bonds/tests/common/mod.rs

## Plan section
### Task 1510: program — exact record date, trustless crank, set hash

**Agent:** glm · **Depends on:** — · **Role:** anchor

**Files:**
- Modify: `programs/qupon_bonds/src/state.rs` (CorporateAction: `pub hash_scheme: u8,` before `reserved`, `reserved: [u8; 63]`)
- Modify: `programs/qupon_bonds/src/constants.rs` (`STRIKE_LEAD_REAL_SECS: i64 = 600`, `SNAP_HASH_DOMAIN: &[u8] = b"qupon:snap:v1"`)
- Modify: `programs/qupon_bonds/src/utils.rs` (`pub fn strike_lead_secs(_series: &Series) -> i64 { STRIKE_LEAD_REAL_SECS }` — 1511 makes it clock-aware)
- Modify: `programs/qupon_bonds/src/instructions/snapshot.rs`, `settle.rs` (pay_batch, complete_action), `retire.rs` (retire_batch), `announce_action.rs` (set `hash_scheme = 1`)
- Modify: `programs/qupon_bonds/src/events.rs` (+ `StrikeTiming`)
- Modify: `services/registrar/internal/chain/types.go` + `decode.go` (CorporateAction `HashScheme uint8` = first reserved byte), `services/registrar/internal/reconcile/reconcile.go` (scheme 1 hash)
- Test: `programs/qupon_bonds/tests/snapshot.rs`, `settle.rs`, `hardening.rs`; `services/registrar/internal/reconcile/reconcile_test.go`
- Regenerate: `clients/ts/src/generated` (`pnpm codama`), `fixtures/accounts/*.b64` via `cargo test -p qupon_bonds --test export_fixtures` (sizes unchanged)
- Docs: `docs/02-architecture.md` (signer column → "anyone" for the crank steps; StrikeTiming), `docs/03-domain.md` §4 (exact boundary + resume rule)

**Interfaces — Produces:** event `StrikeTiming { series, action, index: u32, record_at: i64, struck_at: i64, early_by_secs: i64, snapshot_slot: u64, slot: u64, timestamp: i64 }`; `CorporateAction.hash_scheme` (0 = rolling, 1 = set hash); Go `reconcile.SetHashLeaf(action, owner [32]byte, units uint64) [32]byte`.

- [ ] **Step 1: failing tests** (`tests/snapshot.rs`, using `tests/common` helpers `setup_bond`, `holders`, `intr_args`, `Env::set_clock`):

```rust
#[test]
fn outsider_can_strike_inside_lead_window_and_register_is_exact_at_record_at() {
    let mut env = Env::new();
    let b = setup_bond(&mut env);
    let h = holders(&mut env, &b, &[10, 25, 65]);
    let a = announce_intr(&mut env, &b); // existing helper path via intr_args
    let outsider = env.new_funded_keypair();
    env.set_clock(a.record_at - 300);
    env.send(&[strike_ix(&b, &a, &outsider.pubkey())], &[&outsider]).expect("strike within lead");
    // nobody can move units between the early strike and record_at
    let err = env.send(&[transfer_ix(&b, &h[0], &h[1], 1)], &[&h[0].kp]).unwrap_err();
    assert_err(err, "MintPaused"); // Token-2022 pausable error surfaced as custom 0x43
    env.set_clock(a.record_at + 1);
    snapshot_all_as(&mut env, &b, &a, &h, &outsider);
    let ents = fetch_entitlements(&env, &a);
    assert_eq!(ents.iter().map(|e| e.units).collect::<Vec<_>>(), vec![10, 25, 65]);
    assert_eq!(ents.iter().map(|e| e.gross).collect::<Vec<_>>(), vec![50_000, 125_000, 325_000]);
    let ev = env.last_event::<StrikeTiming>();
    assert_eq!(ev.early_by_secs, 300);
}

#[test]
fn strike_before_lead_window_is_too_early() {
    let (mut env, b, _h, a) = intr_announced();
    env.set_clock(a.record_at - 601);
    let err = env.send(&[strike_ix(&b, &a, &b.registrar.pubkey())], &[&b.registrar]).unwrap_err();
    assert_err(err, "TooEarly");
}

#[test]
fn set_hash_is_independent_of_batch_order() {
    let (mut env, b, h, a) = intr_struck();
    // submit holders in reverse owner order, one per batch, as an outsider
    let outsider = env.new_funded_keypair();
    for holder in h.iter().rev() { env.send(&[snapshot_ix(&b, &a, &[holder], &outsider.pubkey())], &[&outsider]).unwrap(); }
    let action = fetch_action(&env, &a);
    let mut expect = [0u8; 32];
    for holder in &h {
        let leaf = solana_sha256_hasher::hashv(&[b"qupon:snap:v1", a.pda.as_ref(), holder.owner.as_ref(), &holder.units.to_le_bytes()]).to_bytes();
        for i in 0..32 { expect[i] ^= leaf[i]; }
    }
    assert_eq!(action.hash_scheme, 1);
    assert_eq!(action.snapshot_hash, expect);
}

#[test]
fn intr_resumes_trading_after_finalize_and_pays_record_date_holder() {
    let (mut env, b, h, a) = intr_snapshotted(); // finalize done
    assert!(!mint_paused(&env, &b.mint));
    env.send(&[transfer_ix(&b, &h[0], &h[1], 10)], &[&h[0].kp]).expect("ex-date trading");
    fund_full(&mut env, &b, &a);
    let outsider = env.new_funded_keypair();
    pay_all_as(&mut env, &b, &a, &h, &outsider);
    assert_eq!(cash_balance(&env, &h[0]), 50_000); // the seller still gets the coupon
    complete_as(&mut env, &b, &a, &outsider);
    assert_eq!(fetch_action(&env, &a).status, ActionStatus::Completed as u8);
}

#[test]
fn redemption_stays_paused_after_finalize() {
    let (env, b, _h, _a) = redm_snapshotted();
    assert!(mint_paused(&env, &b.mint));
}

#[test]
fn outsider_cannot_fund_or_redirect_payment() {
    let (mut env, b, h, a) = intr_snapshotted();
    let outsider = env.new_funded_keypair();
    assert_err(env.send(&[fund_ix_as(&b, &a, &outsider, 1)], &[&outsider]).unwrap_err(), "Unauthorized");
    fund_full(&mut env, &b, &a);
    // destination is not the investor's registered cash ATA
    let err = env.send(&[pay_ix_with_dest(&b, &a, &h[0], &outsider.cash_ata(&b))], &[&outsider]).unwrap_err();
    assert_err(err, "AccountOwnerMismatch");
}

#[test]
fn account_sizes_unchanged() {
    assert_eq!(8 + CorporateAction::INIT_SPACE, 435);
    assert_eq!(8 + Series::INIT_SPACE, 389);
}
```

(Add any missing tiny helpers — `new_funded_keypair`, `transfer_ix`, `snapshot_all_as`, `pay_all_as`, `complete_as`, `mint_paused`, `last_event` — to `tests/common/mod.rs`; reuse existing builders, do not duplicate them.)
- [ ] **Step 2: run** `cargo test -p qupon_bonds --test snapshot` → new tests fail.
- [ ] **Step 3: implement**
  - `strike_record`: delete `require_operator`; replace the time check with
    ```rust
    let lead = strike_lead_secs(&ctx.accounts.series);
    require!(clock.unix_timestamp >= action.record_at.checked_sub(lead).ok_or(QuponError::MathOverflow)?, QuponError::TooEarly);
    ```
    after the existing `RecordStruck` emit, emit `StrikeTiming { early_by_secs: action.record_at - clock.unix_timestamp, struck_at: clock.unix_timestamp, … }`.
  - `snapshot_batch`, `finalize_snapshot`, `pay_batch`, `complete_action`, `retire_batch`: delete the `require_operator` call (keep the `authority`/payer signer; update its doc comment to "anyone (pays fees/rent)").
  - `snapshot_batch`: replace the hash line with
    ```rust
    if action.hash_scheme == 1 {
        let leaf = solana_sha256_hasher::hashv(&[SNAP_HASH_DOMAIN, action_key.as_ref(), owner.as_ref(), &ata.amount.to_le_bytes()]).to_bytes();
        for (h, l) in action.snapshot_hash.iter_mut().zip(leaf) { *h ^= l; }
    } else {
        action.snapshot_hash = snapshot_hash_step(&action.snapshot_hash, &owner, ata.amount);
    }
    ```
  - `announce_action`: `act.hash_scheme = 1;` for every new action.
  - `finalize_snapshot`: `let resume = meeting || action.kind == ActionKind::Interest as u8 || action.kind == ActionKind::PartialRedemption as u8;` and resume when `resume` (the existing BMET block becomes the `resume` block; comment: "claims are fixed in Entitlement PDAs, so INTR/PCAL trade ex-date while being paid; REDM/MCAL stay frozen until paid and burned").
  - `complete_action`: resume only `if mint_paused(&ctx.accounts.mint.to_account_info())?`.
- [ ] **Step 4: Go** — `chain/types.go` CorporateAction gains `HashScheme uint8`; `decode.go` reads it as the first byte of `reserved` (size check unchanged); `reconcile.go`: `if a.HashScheme == 1 { hash = XOR of SetHashLeaf(...) over investors in any order } else { existing chain }`; table test with the 3 brief holders computing the same bytes as the Rust test.
- [ ] **Step 5: codama + fixtures + docs**, `cargo test -p qupon_bonds`, `go test ./services/registrar/...`, `make verify`.
- [ ] **Step 6: commit** `feat(program): exact record date, permissionless crank, order-independent snapshot hash` (`task: 1510`).

**Acceptance:** all 7 new tests pass; every pre-existing program test passes unedited; CU benchmark test still within limits; Go reconcile test for scheme 1 passes; docs tables updated; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1510`, `reports/worklog/1510.md` written. Print `DONE:1510` or `BLOCKED:1510 <reason>`.
