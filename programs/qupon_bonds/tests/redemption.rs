mod common;

use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{
    error::QuponError, ActionStatus, CorporateAction, Entitlement, EntitlementStatus, Series,
    SeriesStatus,
};
use solana_signer::Signer;

/// REDM at maturity of a one-period series: 2026-07-03 → 2027-01-03, final coupon 180 days.
fn redm_args(now: i64) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    }
}

#[test]
fn retire_before_complete_is_refused() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let holders = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();

    // Retiring before the payment is completed is refused (status machine enforces pay → complete → retire → close).
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), redm_args(now));
    env.send(&[ix], &[]).expect("announce");
    let ix = env.retire_ix(&b, 0, &owners);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
    let ix = env.cancel_ix(&b, 0);
    env.send(&[ix], &[])
        .expect("cancel; start over with the full flow");
}

#[test]
fn redemption_pays_principal_plus_final_coupon() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let holders = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let now = env.now();
    env.settle_action(&b, redm_args(now), &owners);

    for (k, units) in &holders {
        let cash = env.balance(&ata(&k.pubkey(), &b.cash, &b.cash_tp));
        // 10 bonds: 1,000,000 principal + 50,000 final coupon = 1,050,000 tiyn = 10,500.00 KZT (the brief).
        assert_eq!(cash, units * 100_000 + units * 5_000, "{units} units");
    }
    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    assert_eq!(
        (a.status, a.total_principal),
        (ActionStatus::Retiring as u8, 10_000_000)
    );
    let s: Series = env.account(&b.series);
    assert_eq!(s.status, SeriesStatus::Retiring as u8);

    // Close is refused while units are outstanding.
    let ix = env.close_series_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::SupplyNotZero);

    // A suspended holder's frozen ATA is still burned (retire thaws it first).
    let ix = env.set_status_ix(&b, &owners[0], true);
    env.send(&[ix], &[]).expect("suspend");
    let ix = env.retire_ix(&b, 0, &owners[..2]);
    env.send(&[ix], &[]).expect("retire batch 1");
    let ix = env.retire_ix(&b, 0, &owners);
    env.send(&[ix], &[])
        .expect("retire rest (idempotent for the first two)");
    for o in &owners {
        assert_eq!(env.balance(&ata(o, &b.mint, &spl_token_2022::ID)), 0);
        let e: Entitlement = env.account(&entitlement_pda(&pda, o));
        assert_eq!(e.status, EntitlementStatus::Retired as u8);
    }
    let a: CorporateAction = env.account(&pda);
    assert_eq!((a.total_retired, a.holders_retired), (100, 3));

    let before = env
        .svm
        .get_account(&env.registrar.pubkey())
        .unwrap()
        .lamports;
    let ix = env.close_series_ix(&b, 0);
    let res = env.send(&[ix], &[]).expect("close_series");
    assert!(
        res.logs.iter().any(|l| l.contains("Program data:")),
        "SeriesClosed emitted"
    );
    assert!(
        env.svm
            .get_account(&b.mint)
            .is_none_or(|a| a.lamports == 0 && a.data.is_empty()),
        "mint closed"
    );
    assert!(
        env.svm
            .get_account(&env.registrar.pubkey())
            .unwrap()
            .lamports
            > before - 10_000,
        "mint rent returned"
    );
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.status, s.open_action),
        (SeriesStatus::Closed as u8, None)
    );
    let a: CorporateAction = env.account(&pda);
    assert_eq!(a.status, ActionStatus::Completed as u8);
}

#[test]
fn early_redemption_47_days_on_btrk_terms() {
    // BTRK-demo terms: 15.95%; MCAL on 2026-08-20 → 47 accrued days (fixture mcal_accrued_47d, tax 0 here).
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.coupon_rate_bps = 1595);
    let holders = env.holders(&b, &[10]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let now = env.now();
    let mcal = qupon_bonds::AnnounceArgs {
        kind: 2,
        corp_id: corp_id("BTRK-MCAL-0001"),
        period_end_ymd: 20260820,
        period_end_ts: ISSUE_DATE + 48 * 86_400,
        accrual_days: 47,
        rate_bps: 1595,
        ..intr_args(now)
    };
    env.settle_action(&b, mcal, &owners);
    let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 0), &owners[0]));
    assert_eq!((e.gross, e.principal), (20_824, 1_000_000));
    assert_eq!(
        env.balance(&ata(&owners[0], &b.cash, &b.cash_tp)),
        1_020_824
    );

    let ix = env.retire_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("retire");
    let ix = env.close_series_ix(&b, 0);
    env.send(&[ix], &[]).expect("close");
}

#[test]
fn only_operators_retire_and_only_registrar_closes() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let holders = env.holders(&b, &[10]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let now = env.now();
    env.settle_action(&b, redm_args(now), &owners);

    let mallory = solana_keypair::Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let mut ix = env.retire_ix(&b, 0, &owners);
    ix.accounts[0].pubkey = mallory.pubkey();
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);

    let ix = env.retire_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("retire");
    let mut ix = env.close_series_ix(&b, 0);
    ix.accounts[0].pubkey = mallory.pubkey();
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);
}

#[test]
fn retire_rejects_substituted_accounts_and_is_idempotent() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let holders = env.holders(&b, &[10, 25]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let now = env.now();
    env.settle_action(&b, redm_args(now), &owners);

    // A second bond whose Investor PDA belongs to another series.
    let b2 = env.setup_bond();
    let y = solana_keypair::Keypair::new();
    env.register(&b2, &y.pubkey()).expect("register in B");

    // Foreign-series Investor paired with this series' bond ATA: [Entitlement, bond ATA] pairs start at meta 5.
    let mut ix = env.retire_ix(&b, 0, &owners);
    ix.accounts[5].pubkey = investor_pda(&b2.series, &y.pubkey());
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // Someone else's bond ATA.
    let mut ix = env.retire_ix(&b, 0, &owners);
    ix.accounts[6].pubkey = ata(&owners[1], &b.mint, &spl_token_2022::ID);
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // A cash ATA (a token account of another mint).
    let mut ix = env.retire_ix(&b, 0, &owners);
    ix.accounts[6].pubkey = ata(&owners[0], &b.cash, &b.cash_tp);
    assert_err(env.send(&[ix], &[]), QuponError::AccountMintMismatch);

    let pda = action_pda(&b.series, 0);
    let ix = env.retire_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("retire");
    let a: CorporateAction = env.account(&pda);
    assert_eq!((a.holders_retired, a.total_retired), (2, 35));

    // A second identical batch burns nothing and counts nobody again.
    let ix = env.retire_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("idempotent re-run");
    let a: CorporateAction = env.account(&pda);
    assert_eq!((a.holders_retired, a.total_retired), (2, 35));
}
