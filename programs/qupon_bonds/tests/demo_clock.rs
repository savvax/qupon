//! Demo clock per series (plan 15 D7, task 1511): a whole bond life on `day_secs = 1`
//! with the same civil-date math as the real Almaty clock, and the real clock unchanged.
#![allow(clippy::result_large_err)] // TransactionResult is LiteSVM's type
mod common;

use anchor_lang::prelude::Pubkey;
use anchor_spl::token::spl_token;
use common::*;
use qupon_bonds::{error::QuponError, InitSeriesParams, Series};
use solana_signer::Signer;

/// Demo-series params: the anchor instant is `issue_date`, the calendar starts at `issue_ymd`.
fn demo_params(
    env: &Env,
    day_secs: u32,
    issue: i64,
    issue_ymd: u32,
    maturity: i64,
) -> InitSeriesParams {
    let mut p = env.params();
    p.day_secs = day_secs;
    p.issue_date = issue;
    p.issue_ymd = issue_ymd;
    p.maturity_date = maturity;
    p
}

/// Bond mint + cash mint + `init_series` with demo params; the raw result so failure tests can assert on it.
fn try_setup_demo(env: &mut Env, p: InitSeriesParams) -> litesvm::types::TransactionResult {
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, _) = env.create_bond_mint(BondMintOpts::default());
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    env.send(&[ix], &[])
}

fn setup_demo(env: &mut Env, day_secs: u32, issue_ymd: u32, maturity_offset: i64) -> Bond {
    let issue = env.now();
    let p = demo_params(env, day_secs, issue, issue_ymd, issue + maturity_offset);
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, series) = env.create_bond_mint(BondMintOpts::default());
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    env.send(&[ix], &[]).expect("init demo series");
    Bond {
        mint,
        series,
        cash,
        cash_tp: spl_token::ID,
    }
}

/// `announce_action` args for a demo series: civil dates of the period, timestamps on the demo clock.
/// record_at = period_end − 1 series-day (start of the last day, 03-domain §1), payment_at = period_end.
fn demo_action_args(
    kind: u8,
    corp: &str,
    start_ymd: u32,
    end_ymd: u32,
    period_start: i64,
    period_end: i64,
) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind,
        corp_id: corp_id(corp),
        record_at: period_end - 1,
        payment_at: period_end,
        period_start_ymd: start_ymd,
        period_end_ymd: end_ymd,
        period_start_ts: period_start,
        period_end_ts: period_end,
        accrual_days: 180, // 30E/360 semi-annual regular period
        rate_bps: 1000,
        ..intr_args(0)
    }
}

/// strike → snapshot → finalize at the (already reached) record date.
fn crank_record(env: &mut Env, b: &Bond, index: u32, owners: &[Pubkey]) {
    for ix in [
        env.strike_ix(b, &env.registrar.pubkey(), index),
        env.snapshot_ix(b, index, owners),
        env.finalize_snapshot_ix(b, index),
    ] {
        env.send(&[ix], &[]).expect("record date crank");
    }
}

/// fund exactly → pay → complete (the action at `index` is announced and snapshotted).
fn crank_settle(env: &mut Env, b: &Bond, index: u32, owners: &[Pubkey]) {
    let a: qupon_bonds::CorporateAction = env.account(&action_pda(&b.series, index));
    let required = a.total_net + a.total_tax + a.total_principal;
    env.issuer_cash(b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(b, &issuer.pubkey(), required);
    let ix = env.fund_ix(b, &issuer.pubkey(), index, required);
    env.send(&[ix], &[&issuer]).expect("fund");
    let ix = env.pay_ix(b, index, owners);
    env.send(&[ix], &[]).expect("pay");
    let ix = env.complete_ix(b, index);
    env.send(&[ix], &[]).expect("complete");
}

/// Token-2022 base Mint: supply u64 at offset 36.
fn mint_supply(env: &Env, b: &Bond) -> u64 {
    let acc = env.svm.get_account(&b.mint).expect("mint account");
    u64::from_le_bytes(acc.data[36..44].try_into().unwrap())
}

/// 1-year, semi-annual, 1 civil day = 1 s: coupon 1 at issue+182, maturity at issue+365 —
/// the whole life of the brief's bond in ~6 minutes of wall time with identical amounts.
#[test]
fn whole_bond_life_on_a_1s_demo_clock() {
    let mut env = Env::new();
    let issue = env.now();
    let b = setup_demo(&mut env, 1, 20_261_009, 365);
    let h = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = h.iter().map(|(k, _)| k.pubkey()).collect();
    let s: Series = env.account(&b.series);
    assert_eq!((s.day_secs, s.issue_ymd), (1, 20_261_009));
    assert_eq!(
        s.next_coupon_date,
        issue + 182,
        "2026-10-09 + 6 months = 2027-04-09 = 182 civil days"
    );

    // INTR #1: period 2026-10-09 → 2027-04-09 = 180 days (30E/360); record at the last day's start.
    let intr = demo_action_args(
        0,
        "QPNb1-INTR-0001",
        20_261_009,
        20_270_409,
        issue,
        issue + 182,
    );
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr);
    env.send(&[ix], &[]).expect("announce INTR");
    env.set_clock(issue + 181);
    crank_record(&mut env, &b, 0, &owners);
    crank_settle(&mut env, &b, 0, &owners);
    // holders() sorts by owner pubkey, so assert per holder: units × 5,000 tiyn (500.00 KZT per bond).
    for (k, units) in &h {
        assert_eq!(
            env.balance(&ata(&k.pubkey(), &b.cash, &b.cash_tp)),
            units * 5_000
        );
    }

    // REDM at maturity: final coupon 2027-04-09 → 2027-10-09 + principal; burn everything.
    let redm = demo_action_args(
        1,
        "QPNb1-REDM-0001",
        20_270_409,
        20_271_009,
        issue + 182,
        issue + 365,
    );
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), redm);
    env.send(&[ix], &[]).expect("announce REDM");
    env.set_clock(issue + 364);
    crank_record(&mut env, &b, 1, &owners);
    crank_settle(&mut env, &b, 1, &owners);
    let ix = env.retire_ix(&b, 1, &owners);
    env.send(&[ix], &[]).expect("retire");
    assert_eq!(mint_supply(&env, &b), 0);
}

/// A maturity that is not a midnight of the demo clock is rejected.
#[test]
fn demo_clock_rejects_non_midnight_maturity() {
    let mut env = Env::new();
    let issue = env.now();
    let p = demo_params(&env, 2, issue, 20_261_009, issue + 731); // 731 is odd → not a 2 s-day midnight
    let res = try_setup_demo(&mut env, p);
    assert_err(res, QuponError::InvalidDates);
}

/// day_secs must be < one real day (0 = real clock).
#[test]
fn demo_clock_rejects_day_secs_of_a_real_day() {
    let mut env = Env::new();
    let issue = env.now();
    let p = demo_params(&env, 86_400, issue, 20_261_009, issue + 365 * 86_400);
    let res = try_setup_demo(&mut env, p);
    assert_err(res, QuponError::InvalidParams);
}

/// The real clock is byte-for-byte today's behaviour: day_secs = 0 → the same next_coupon_date as before.
#[test]
fn real_clock_series_unchanged() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let s: Series = env.account(&b.series);
    assert_eq!(s.day_secs, 0);
    assert_eq!(s.issue_ymd, 20_260_703, "issue civil date derived on-chain");
    assert_eq!(s.next_coupon_date, NEXT_COUPON); // 2027-01-03 00:00 Asia/Almaty, as before the refactor
}
