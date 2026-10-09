//! Atomic redemption (plan 15 D5, task 1513): a full redemption pays principal + final coupon and burns the
//! holder's units in the same instruction; the pay layout carries the payout-route slot (D6).
mod common;

use anchor_lang::prelude::Pubkey;
use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{error::QuponError, CorporateAction, Entitlement, EntitlementStatus};
use solana_keypair::Keypair;
use solana_signer::Signer;

fn redm_args(now: i64) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    }
}

/// Legacy series maturing at the first coupon date, holders 10 / 25 / 65, REDM snapshotted and fully funded.
fn redm_funded() -> (Env, Bond, Vec<Keypair>) {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let h: Vec<Keypair> = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), redm_args(now));
    env.send(&[ix], &[]).unwrap();
    env.set_clock(now + 60);
    for ix in [
        env.strike_ix(&b, &env.registrar.pubkey(), 0),
        env.snapshot_ix(&b, 0, &owners),
        env.finalize_snapshot_ix(&b, 0),
    ] {
        env.send(&[ix], &[]).unwrap();
    }
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    let required = a.total_net + a.total_tax + a.total_principal;
    env.issuer_cash(&b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(&b, &issuer.pubkey(), required);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, required);
    env.send(&[ix], &[&issuer]).unwrap();
    (env, b, h)
}

fn keys(h: &[Keypair]) -> Vec<Pubkey> {
    h.iter().map(|k| k.pubkey()).collect()
}

fn supply(env: &Env, b: &Bond) -> u64 {
    let m = env.svm.get_account(&b.mint).unwrap();
    u64::from_le_bytes(m.data[36..44].try_into().unwrap())
}

fn paused(env: &Env, b: &Bond) -> bool {
    use spl_token_2022::extension::{
        pausable::PausableConfig, BaseStateWithExtensions, StateWithExtensions,
    };
    let m = env.svm.get_account(&b.mint).unwrap();
    let st = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&m.data).unwrap();
    bool::from(st.get_extension::<PausableConfig>().unwrap().paused)
}

#[test]
fn a_redemption_pays_and_burns_in_one_instruction() {
    let (mut env, b, h) = redm_funded();
    let owners = keys(&h);
    let units: Vec<u64> = owners
        .iter()
        .map(|o| env.balance(&ata(o, &b.mint, &spl_token_2022::ID)))
        .collect();
    let outsider = Keypair::new();
    env.svm.airdrop(&outsider.pubkey(), 1_000_000_000).unwrap();
    let mut ix = env.pay_ix(&b, 0, &owners);
    ix.accounts[0].pubkey = outsider.pubkey();
    env.send(&[ix], &[&outsider])
        .expect("anyone pays and burns");
    for (o, u) in owners.iter().zip(&units) {
        // principal 100,000 + final coupon 5,000 per bond
        assert_eq!(env.balance(&ata(o, &b.cash, &b.cash_tp)), u * 105_000);
        assert_eq!(env.balance(&ata(o, &b.mint, &spl_token_2022::ID)), 0);
        let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 0), o));
        assert_eq!(e.status, EntitlementStatus::Retired as u8);
    }
    assert_eq!(supply(&env, &b), 0);
    assert!(
        paused(&env, &b),
        "the legacy register is paused again after the batch"
    );
    env.send(&[env.complete_ix(&b, 0)], &[]).expect("complete");
    env.send(&[env.close_series_ix(&b, 0)], &[])
        .expect("close right away: nothing left to retire");
}

#[test]
fn a_suspended_holder_is_thawed_burned_and_paid() {
    let (mut env, b, h) = redm_funded();
    let owners = keys(&h);
    let target = owners[1];
    let units = env.balance(&ata(&target, &b.mint, &spl_token_2022::ID));
    let ix = env.set_status_ix(&b, &target, true);
    env.send(&[ix], &[]).expect("suspend");
    env.send(&[env.pay_ix(&b, 0, &owners)], &[])
        .expect("pay + burn");
    assert_eq!(env.balance(&ata(&target, &b.mint, &spl_token_2022::ID)), 0);
    assert_eq!(
        env.balance(&ata(&target, &b.cash, &b.cash_tp)),
        units * 105_000
    );
}

#[test]
fn pay_rejects_a_wrong_route_slot() {
    let (mut env, b, h) = redm_funded();
    let owners = keys(&h);
    let mut ix = env.pay_ix(&b, 0, &owners[..1]);
    ix.accounts[11].pubkey = Pubkey::new_unique();
    assert_err(env.send(&[ix], &[]), QuponError::InvalidParams);
}

#[test]
fn a_coupon_does_not_burn() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let owners: Vec<Pubkey> = env
        .holders(&b, &[10, 25, 65])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
    let now = env.now();
    env.settle_action(&b, intr_args(now), &owners);
    assert_eq!(supply(&env, &b), 100);
}
