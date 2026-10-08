mod common;

use anchor_spl::{token::spl_token, token_2022::spl_token_2022};
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

/// PCAL 25% on 2026-08-20 (47 accrued days): holders keep every unit, a quarter of the face comes back with the
/// accrued coupon, the series stays Active on a 750.00 KZT outstanding face, and nothing can be burned.
#[test]
fn partial_call_keeps_units_and_lowers_face() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let face_before = env.account::<Series>(&b.series).face_value;
    let now = env.now();
    let pcal = qupon_bonds::AnnounceArgs {
        kind: 3,
        corp_id: corp_id("QPNb1-PCAL-0001"),
        factor_bps: 2500,
        period_end_ymd: 20260820,
        period_end_ts: ISSUE_DATE + 48 * 86_400,
        accrual_days: 47,
        ..intr_args(now)
    };
    env.settle_action(&b, pcal, &owners);

    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    assert_eq!(a.status, ActionStatus::Completed as u8);
    assert_eq!(a.per_unit_principal, face_before / 4);
    for (k, units) in &holders {
        let e: Entitlement = env.account(&entitlement_pda(&pda, &k.pubkey()));
        assert_eq!(e.principal, units * face_before / 4, "{units} units");
        assert_eq!(
            env.balance(&ata(&k.pubkey(), &b.mint, &spl_token_2022::ID)),
            *units,
            "units are kept"
        );
    }
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.status, s.open_action, s.face_value, s.period_start),
        (
            SeriesStatus::Active as u8,
            None,
            face_before - face_before / 4,
            a.period_end
        )
    );
    let ix = env.retire_ix(&b, 0, &owners);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
    let ix = env.close_series_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
}

/// fund_action takes only the shortfall; anything that still lands in the escrow is swept back to the issuer once
/// the action is finished, by an operator only.
#[test]
fn fund_takes_only_the_shortfall_and_sweep_returns_strays() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    env.intr_snapshotted(&b, &owners);

    let pda = action_pda(&b.series, 0);
    let escrow = ata(&pda, &b.cash, &b.cash_tp);
    let a: CorporateAction = env.account(&pda);
    let required = a.total_net + a.total_tax + a.total_principal;
    let issuer = env.issuer.insecure_clone();
    let issuer_cash = env.issuer_cash(&b);
    env.fund_cash(&b, &issuer.pubkey(), required + 500);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, required + 500);
    env.send(&[ix], &[&issuer]).expect("over-fund");
    assert_eq!(env.balance(&escrow), required, "only the shortfall moved");
    assert_eq!(env.balance(&issuer_cash), 500);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 1);
    assert_err(env.send(&[ix], &[&issuer]), QuponError::NothingToDo);

    // Not finished yet: nothing can be swept.
    let ix = env.sweep_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);

    let ix = env.pay_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("pay");
    let ix = env.complete_ix(&b, 0);
    env.send(&[ix], &[]).expect("complete");

    // A stray transfer into the finished escrow.
    let ix =
        spl_token::instruction::mint_to(&spl_token::ID, &b.cash, &escrow, &issuer.pubkey(), &[], 7)
            .unwrap();
    env.send(&[ix], &[&issuer]).expect("stray");

    let mallory = solana_keypair::Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let mut ix = env.sweep_ix(&b, 0);
    ix.accounts[0].pubkey = mallory.pubkey();
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);

    let ix = env.sweep_ix(&b, 0);
    env.send(&[ix], &[]).expect("sweep");
    assert_eq!(env.balance(&issuer_cash), 507);
    assert!(
        env.svm
            .get_account(&escrow)
            .is_none_or(|a| a.lamports == 0 && a.data.is_empty()),
        "escrow closed"
    );
}
