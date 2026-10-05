//! The brief's worked example as executable acceptance tests (docs/00-brief.md):
//! face 1,000 KZT (100,000 tiyn), 10% annual coupon, semi-annual, 30/360. Amounts are in tiyn (1/100 KZT).
#![allow(clippy::result_large_err)] // TransactionResult is LiteSVM's type
mod common;

use common::*;
use qupon_bonds::{error::QuponError, CorporateAction, Entitlement};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn custom_err(res: litesvm::types::TransactionResult, code: u32) {
    let err = format!("{:?}", res.expect_err("transaction must fail").err);
    assert!(
        err.contains(&format!("Custom({code})")),
        "expected Custom({code}), got {err}"
    );
}

/// "An investor holding 10 bonds on the record date is entitled to 10 × $1,000 × 10% ÷ 2 = $500."
#[test]
fn coupon_10_bonds_is_500() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let h = env.holders(&b, &[10]);
    let alice = h[0].0.pubkey();
    env.intr_snapshotted(&b, &[alice]);
    let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 0), &alice));
    assert_eq!(e.gross, 50_000, "500.00 KZT");

    env.issuer_cash(&b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(&b, &issuer.pubkey(), 50_000);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 50_000);
    env.send(&[ix], &[&issuer]).expect("fund");
    let ix = env.pay_ix(&b, 0, &[alice]);
    env.send(&[ix], &[]).expect("pay");
    assert_eq!(
        env.balance(&ata(&alice, &b.cash, &b.cash_tp)),
        50_000,
        "paid on-chain"
    );
}

/// Per-holder rounding: Σ entitlements of 10/25/65 = supply (100) × per-unit coupon (5,000).
#[test]
fn three_holders_sum_to_supply_times_coupon() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let owners: Vec<_> = env
        .holders(&b, &[10, 25, 65])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
    env.intr_snapshotted(&b, &owners);
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!((a.units_snapshotted, a.per_unit_gross), (100, 5_000));
    assert_eq!(
        a.total_gross,
        100 * 5_000,
        "500.00 + 1,250.00 + 3,250.00 = 5,000.00 KZT"
    );
}

/// "At maturity the same holder is entitled to $10,000 principal plus any final coupon due."
#[test]
fn redemption_pays_principal_plus_final_coupon() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON); // one period left: the final coupon is due
    let alice = env.holders(&b, &[10])[0].0.pubkey();
    let now = env.now();
    let redm = qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    };
    env.settle_action(&b, redm, &[alice]);
    assert_eq!(
        env.balance(&ata(&alice, &b.cash, &b.cash_tp)),
        1_050_000,
        "10,000.00 + 500.00 KZT"
    );

    let ix = env.retire_ix(&b, 0, &[alice]);
    env.send(&[ix], &[]).expect("retire");
    let ix = env.close_series_ix(&b, 0);
    env.send(&[ix], &[]).expect("close");
    assert!(
        env.svm
            .get_account(&b.mint)
            .is_none_or(|a| a.data.is_empty()),
        "tokens retired, mint closed"
    );
}

/// Holder registry: a wallet the registrar has not registered cannot receive the bond.
#[test]
fn unregistered_wallet_cannot_hold() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let alice = env.holders(&b, &[10]).remove(0).0;
    let outsider = Keypair::new().pubkey();
    let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(), &outsider, &b.mint, &anchor_spl::token_2022::ID,
    );
    env.send(&[create], &[])
        .expect("anyone may create the ATA — it starts frozen");
    custom_err(
        env.send(
            &[bond_transfer(&b, &alice.pubkey(), &outsider, 1)],
            &[&alice],
        ),
        17,
    ); // AccountFrozen
}

/// Record-date mechanism: the register cannot be struck before the record time.
#[test]
fn record_date_before_time_rejected() {
    let mut env = Env::new();
    let b = env.setup_bond();
    env.holders(&b, &[10]);
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now)); // record_at = now + 60
    env.send(&[ix], &[]).expect("announce");
    env.fast_forward(59);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    assert_err(env.send(&[ix], &[]), QuponError::TooEarly);
    env.fast_forward(1);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike at the record time");
}

/// Record date = paused mint: holders cannot move bonds while the snapshot is taken.
#[test]
fn paused_mint_blocks_transfer() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let h = env.holders(&b, &[10, 25]);
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");
    env.fast_forward(60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");
    let (from, to) = (&h[0].0, h[1].0.pubkey());
    custom_err(
        env.send(&[bond_transfer(&b, &from.pubkey(), &to, 1)], &[from]),
        67,
    ); // Token-2022 MintPaused
}

/// Batches are idempotent: re-sending snapshot and pay batches changes nothing and pays nobody twice.
#[test]
fn rerun_batches_is_noop() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let owners: Vec<_> = env
        .holders(&b, &[10, 25, 65])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
    env.intr_snapshotted(&b, &owners);
    let pda = action_pda(&b.series, 0);
    let ix = env.snapshot_ix(&b, 0, &owners);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus); // snapshot already finalized

    env.issuer_cash(&b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(&b, &issuer.pubkey(), 500_000);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 500_000);
    env.send(&[ix], &[&issuer]).expect("fund");
    let ix = env.pay_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("pay");
    let state = env.svm.get_account(&pda).unwrap().data;
    env.fast_forward(1); // fresh blockhash/slot context for the identical batch
    let ix = env.pay_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("re-sent pay batch is accepted");
    assert_eq!(
        env.svm.get_account(&pda).unwrap().data,
        state,
        "…and is a no-op"
    );
    assert_eq!(
        env.balance(&ata(&owners[0], &b.cash, &b.cash_tp)) % 5_000,
        0
    );
}

/// Settlement only from a funded escrow.
#[test]
fn underfunded_escrow_rejected() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let owners: Vec<_> = env
        .holders(&b, &[10])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
    env.intr_snapshotted(&b, &owners);
    let ix = env.pay_ix(&b, 0, &owners);
    assert_err(env.send(&[ix], &[]), QuponError::Underfunded);
}
