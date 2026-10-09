//! Default and cure (plan 15 D4, task 1512): anyone declares a default once the payment date plus one series day
//! passed without full funding; claims stay with the record-date holders; funding later cures it.
mod common;

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
};
use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{error::QuponError, ActionStatus, CorporateAction, Series};
use solana_keypair::Keypair;
use solana_signer::Signer;

const DAY: i64 = 86_400; // real clock: grace = one civil day

fn declare_default_ix(b: &Bond, index: u32, payer: &Pubkey) -> Instruction {
    let action = action_pda(&b.series, index);
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::DeclareDefault {}.data(),
        qupon_bonds::accounts::DeclareDefault {
            payer: *payer,
            series: b.series,
            action,
            escrow: ata(&action, &b.cash, &b.cash_tp),
        }
        .to_account_metas(None),
    )
}

/// Legacy series, holders 10 / 25 / 65, coupon 0 snapshotted (finalized), nothing funded; an outsider with SOL.
fn unfunded() -> (Env, Bond, Vec<Keypair>, CorporateAction, Keypair) {
    let mut env = Env::new();
    let b = env.setup_bond();
    let h: Vec<Keypair> = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    env.intr_snapshotted(&b, &owners);
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    let outsider = Keypair::new();
    env.svm.airdrop(&outsider.pubkey(), 1_000_000_000).unwrap();
    (env, b, h, a, outsider)
}

fn fund(env: &mut Env, b: &Bond, amount: u64) {
    env.issuer_cash(b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(b, &issuer.pubkey(), amount);
    let ix = env.fund_ix(b, &issuer.pubkey(), 0, amount);
    env.send(&[ix], &[&issuer]).expect("fund");
}

fn status(env: &Env, b: &Bond) -> u8 {
    env.account::<CorporateAction>(&action_pda(&b.series, 0))
        .status
}

#[test]
fn a_default_needs_the_payment_date_plus_one_series_day() {
    let (mut env, b, _h, a, outsider) = unfunded();
    env.set_clock(a.payment_at + DAY - 1);
    let ix = declare_default_ix(&b, 0, &outsider.pubkey());
    assert_err(env.send(&[ix], &[&outsider]), QuponError::NotOverdue);
}

#[test]
fn anyone_declares_a_default_and_the_bond_keeps_trading() {
    let (mut env, b, h, a, outsider) = unfunded();
    fund(&mut env, &b, 100_000);
    env.set_clock(a.payment_at + DAY);
    let ix = declare_default_ix(&b, 0, &outsider.pubkey());
    env.send(&[ix], &[&outsider]).expect("anyone declares");
    let (act, s): (CorporateAction, Series) = (
        env.account(&action_pda(&b.series, 0)),
        env.account(&b.series),
    );
    assert_eq!(act.status, ActionStatus::Defaulted as u8);
    assert!(act.defaulted_at >= a.payment_at + DAY);
    assert_eq!((s.in_default, s.defaults_count), (1, 1));
    assert_eq!(
        env.balance(&ata(&action_pda(&b.series, 0), &b.cash, &b.cash_tp)),
        100_000,
        "the partial funding stays in escrow (shortfall 400,000)"
    );
    // The coupon record is final: the bond trades while the issuer is in default.
    let t = bond_transfer(&b, &h[2].pubkey(), &h[0].pubkey(), 5);
    env.send(&[t], &[&h[2]]).expect("trades in default");
}

#[test]
fn a_fully_funded_action_cannot_default() {
    let (mut env, b, _h, a, outsider) = unfunded();
    fund(&mut env, &b, 500_000);
    env.set_clock(a.payment_at + DAY);
    let ix = declare_default_ix(&b, 0, &outsider.pubkey());
    assert_err(env.send(&[ix], &[&outsider]), QuponError::WrongStatus);
}

#[test]
fn a_cure_pays_the_record_date_holders_not_the_buyers() {
    let (mut env, b, h, a, outsider) = unfunded();
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    let units: Vec<u64> = owners
        .iter()
        .map(|o| env.balance(&ata(o, &b.mint, &spl_token_2022::ID)))
        .collect();
    env.set_clock(a.payment_at + DAY);
    let ix = declare_default_ix(&b, 0, &outsider.pubkey());
    env.send(&[ix], &[&outsider]).unwrap();
    // The largest holder sells everything after the default.
    let seller = units.iter().position(|u| *u == 65).unwrap();
    let buyer = (seller + 1) % 3;
    let t = bond_transfer(&b, &owners[seller], &owners[buyer], 65);
    env.send(&[t], &[&h[seller]]).unwrap();

    fund(&mut env, &b, 500_000);
    assert_eq!(status(&env, &b), ActionStatus::Funded as u8);
    let act: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert!(act.cured_at > 0);
    assert_eq!(env.account::<Series>(&b.series).in_default, 0);
    let mut ix = env.pay_ix(&b, 0, &owners);
    ix.accounts[0].pubkey = outsider.pubkey();
    env.send(&[ix], &[&outsider])
        .expect("anyone pays after the cure");
    for (o, u) in owners.iter().zip(&units) {
        assert_eq!(
            env.balance(&ata(o, &b.cash, &b.cash_tp)),
            u * 5_000,
            "coupon per record-date holding"
        );
    }
}

#[test]
fn a_redemption_default_keeps_the_register_frozen() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let owners: Vec<Pubkey> = env
        .holders(&b, &[10, 25, 65])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
    let now = env.now();
    let args = qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    };
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), args);
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
    env.set_clock(a.payment_at + DAY);
    let ix = declare_default_ix(&b, 0, &env.registrar.pubkey());
    env.send(&[ix], &[]).expect("redemption default");
    // Matured bonds do not trade: issuing is refused while the mint stays paused.
    let issuer = env.issuer.insecure_clone();
    let ix = env.issue_ix(&b, &issuer.pubkey(), &owners[0], 1);
    assert_err(env.send(&[ix], &[&issuer]), QuponError::MintPaused);
}

#[test]
fn no_new_action_while_defaulted() {
    let (mut env, b, _h, a, outsider) = unfunded();
    env.set_clock(a.payment_at + DAY);
    let ix = declare_default_ix(&b, 0, &outsider.pubkey());
    env.send(&[ix], &[&outsider]).unwrap();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    assert_err(env.send(&[ix], &[]), QuponError::ActionAlreadyOpen);
}

#[test]
fn sizes_unchanged() {
    use anchor_lang::Space;
    assert_eq!(8 + Series::INIT_SPACE, 389);
    assert_eq!(8 + CorporateAction::INIT_SPACE, 435);
}
