mod common;

use common::*;
use qupon_bonds::{error::QuponError, ActionStatus, CorporateAction, Series};
use solana_signer::Signer;

#[test]
fn announce_intr_with_brief_numbers() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce INTR");

    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    assert_eq!((a.kind, a.mandatory, a.index), (0, 0, 0));
    assert_eq!(
        a.per_unit_gross, 5_000,
        "1,000 KZT x 10% / 2 = 50.00 KZT per bond"
    );
    assert_eq!(
        (a.per_unit_principal, a.accrual_days, a.rate_bps),
        (0, 180, 1000)
    );
    assert_eq!((a.period_start, a.period_end), (ISSUE_DATE, NEXT_COUPON));
    assert_eq!(
        (a.record_at, a.payment_at, a.announced_at),
        (now + 60, now + 120, now)
    );
    assert_eq!(a.status, ActionStatus::Announced as u8);
    assert_eq!(&a.corp_id[..15], b"QPNb1-INTR-0001");
    assert_eq!(a.escrow, ata(&pda, &b.cash, &b.cash_tp));
    assert!(
        env.svm.get_account(&a.escrow).is_some(),
        "escrow ATA created"
    );

    let s: Series = env.account(&b.series);
    assert_eq!((s.action_count, s.open_action), (1, Some(pda)));
}

#[test]
fn announce_rejects_wrong_figures_and_dates() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let now = env.now();
    let reg = env.registrar.pubkey();

    let mut a = intr_args(now);
    a.accrual_days = 181;
    let ix = env.announce_ix(&b, &reg, a);
    assert_err(env.send(&[ix], &[]), QuponError::EntitlementCalcMismatch);

    let mut a = intr_args(now);
    a.rate_bps = 1200; // the rate is a series term until a meeting changes it
    let ix = env.announce_ix(&b, &reg, a);
    assert_err(env.send(&[ix], &[]), QuponError::EntitlementCalcMismatch);

    let mut a = intr_args(now);
    a.period_end_ymd = 20270104; // ymd must be the Almaty date of period_end_ts
    a.accrual_days = 181;
    let ix = env.announce_ix(&b, &reg, a);
    assert_err(env.send(&[ix], &[]), QuponError::InvalidDates);

    let mut a = intr_args(now);
    a.record_at = now; // must be in the future
    let ix = env.announce_ix(&b, &reg, a);
    assert_err(env.send(&[ix], &[]), QuponError::InvalidDates);

    let mut a = intr_args(now);
    a.payment_at = a.record_at - 1;
    let ix = env.announce_ix(&b, &reg, a);
    assert_err(env.send(&[ix], &[]), QuponError::InvalidDates);

    let ix = env.announce_ix(&b, &env.issuer.pubkey(), intr_args(now));
    let issuer = env.issuer.insecure_clone();
    assert_err(env.send(&[ix], &[&issuer]), QuponError::Unauthorized);
}

#[test]
fn one_open_action_and_cancel_reopens() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let reg = env.registrar.pubkey();
    let now = env.now();
    let ix = env.announce_ix(&b, &reg, intr_args(now));
    env.send(&[ix], &[]).expect("first announce");

    let ix = env.announce_ix(&b, &reg, intr_args(now));
    assert_err(env.send(&[ix], &[]), QuponError::ActionAlreadyOpen);

    let ix = env.cancel_ix(&b, 0);
    env.send(&[ix], &[]).expect("cancel");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(a.status, ActionStatus::Cancelled as u8);
    let ix = env.cancel_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);

    let ix = env.announce_ix(&b, &reg, intr_args(now));
    env.send(&[ix], &[]).expect("announce again after cancel");
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.action_count, s.open_action),
        (2, Some(action_pda(&b.series, 1)))
    );
}

#[test]
fn bmet_by_issuer_with_proposal() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let now = env.now();
    let args = qupon_bonds::AnnounceArgs {
        kind: 4,
        mandatory: 1,
        corp_id: corp_id("QPNb1-BMET-0001"),
        proposal_new_rate_bps: 1200,
        voting_ends_at: now + 180,
        period_start_ymd: 0,
        period_end_ymd: 0,
        period_start_ts: 0,
        period_end_ts: 0,
        accrual_days: 0,
        rate_bps: 0,
        ..intr_args(now)
    };
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), args.clone());
    assert_err(env.send(&[ix], &[]), QuponError::Unauthorized);

    let ix = env.announce_ix(&b, &env.issuer.pubkey(), args);
    let issuer = env.issuer.insecure_clone();
    env.send(&[ix], &[&issuer]).expect("BMET by issuer");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(
        (
            a.kind,
            a.mandatory,
            a.proposal_new_rate_bps,
            a.voting_ends_at
        ),
        (4, 1, 1200, now + 180)
    );
    assert_eq!((a.per_unit_gross, a.per_unit_principal), (0, 0));
}

#[test]
fn redemption_and_early_call_figures() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let reg = env.registrar.pubkey();
    let now = env.now();

    // REDM must end at maturity; the series is still in its first period, so it is rejected here.
    let redm = qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    };
    let ix = env.announce_ix(&b, &reg, redm);
    assert_err(env.send(&[ix], &[]), QuponError::EntitlementCalcMismatch);

    // MCAL on 2026-08-20: 47 accrued days, principal = face (fixtures: mcal_accrued_47d).
    let mcal = qupon_bonds::AnnounceArgs {
        kind: 2,
        corp_id: corp_id("QPNb1-MCAL-0001"),
        period_end_ymd: 20260820,
        period_end_ts: ISSUE_DATE + 48 * 86_400,
        accrual_days: 47,
        ..intr_args(now)
    };
    let ix = env.announce_ix(&b, &reg, mcal);
    env.send(&[ix], &[]).expect("MCAL");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!((a.per_unit_principal, a.accrual_days), (100_000, 47));
    assert_eq!(
        a.per_unit_gross, 1_306,
        "100,000 x 10% x 47/360 = 1,305.56 -> 1,306"
    );
}
