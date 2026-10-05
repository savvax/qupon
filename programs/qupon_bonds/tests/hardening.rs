//! Guards added by the hardening pass (task 035) — see docs/SECURITY_NOTES.md.
#![allow(clippy::result_large_err)] // TransactionResult is LiteSVM's type
mod common;

use anchor_lang::solana_program::instruction::{AccountMeta, Instruction};
use anchor_spl::token::spl_token;
use common::*;
use qupon_bonds::{error::QuponError, CorporateAction};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn units_moved_after_resume_cannot_block_close() {
    // REDM paid and completed → mint resumed → holder A moves 1 unit to B, a registered wallet that held nothing
    // on the record date (so B has no Entitlement). Without the [Investor, ATA] retire path supply never hits 0.
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let a = env.holders(&b, &[10]).remove(0).0;
    let bob = Keypair::new().pubkey();
    env.register(&b, &bob).expect("register B (0 units)");
    let now = env.now();
    let redm = qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    };
    env.settle_action(&b, redm, &[a.pubkey()]);
    env.send(&[bond_transfer(&b, &a.pubkey(), &bob, 1)], &[&a])
        .expect("transfer after resume");

    let ix = env.retire_ix(&b, 0, &[a.pubkey()]);
    env.send(&[ix], &[]).expect("retire A");
    let ix = env.close_series_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::SupplyNotZero);

    let mut ix = env.retire_ix(&b, 0, &[]);
    ix.accounts.push(AccountMeta::new_readonly(
        investor_pda(&b.series, &bob),
        false,
    ));
    ix.accounts.push(AccountMeta::new(
        ata(&bob, &b.mint, &anchor_spl::token_2022::ID),
        false,
    ));
    env.send(&[ix], &[]).expect("retire B's orphan unit");
    let act: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!((act.total_retired, act.holders_retired), (10, 1));

    let ix = env.close_series_ix(&b, 0);
    env.send(&[ix], &[]).expect("close");
    env.fast_forward(1);
    let ix = env.close_series_ix(&b, 0);
    assert!(
        env.send(&[ix], &[]).is_err(),
        "close_series cannot run twice"
    );
}

#[test]
fn init_series_validates_identifiers_and_pointer_authority() {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, _) = env.create_bond_mint(BondMintOpts::default());
    let send = |env: &mut Env, ix: Instruction| env.send(&[ix], &[]);

    let mut p = env.params();
    p.isin[3] = b' ';
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    assert_err(send(&mut env, ix), QuponError::InvalidParams);

    let mut p = env.params();
    p.ticker = [0; 16];
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    assert_err(send(&mut env, ix), QuponError::InvalidParams);

    let mut p = env.params();
    p.ticker[6] = b'X'; // garbage after the zero padding
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    assert_err(send(&mut env, ix), QuponError::InvalidParams);

    let rogue = Keypair::new().pubkey();
    let (mint2, _) = env.create_bond_mint(BondMintOpts {
        pointer_authority: Some(rogue),
        ..Default::default()
    });
    let ix = env.init_series_ix(mint2, cash, spl_token::ID, env.params());
    assert_err(send(&mut env, ix), QuponError::InvalidAuthority);
}
