mod common;

use anchor_lang::solana_program::program_pack::Pack;
use anchor_spl::token_2022::spl_token_2022::extension::ExtensionType;
use anchor_spl::{
    associated_token::get_associated_token_address_with_program_id, token::spl_token,
};
use common::*;
use qupon_bonds::{
    error::QuponError,
    state::{Series, SeriesStatus},
};
use solana_keypair::Keypair;
use solana_signer::Signer;

#[test]
fn init_series_happy_path() {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, series) = env.create_bond_mint(BondMintOpts::default());
    let ix = env.init_series_ix(mint, cash, spl_token::ID, env.params());
    let res = env.send(&[ix], &[]).expect("init_series");
    assert!(
        res.logs.iter().any(|l| l.contains("Program data:")),
        "SeriesInitialized event emitted"
    );

    let s: Series = env.account(&series);
    assert_eq!((s.mint, s.cash_mint), (mint, cash));
    assert_eq!(s.registrar, env.registrar.pubkey());
    assert_eq!(
        (s.issuer, s.paying_agent),
        (env.issuer.pubkey(), env.paying_agent.pubkey())
    );
    assert_eq!(&s.isin, b"KZ2C0QUPON01");
    assert_eq!(&s.ticker[..5], b"QPNb1");
    assert_eq!(
        (s.face_value, s.coupon_rate_bps, s.frequency, s.day_count),
        (100_000, 1000, 2, 0)
    );
    assert_eq!(
        (s.issue_date, s.period_start, s.maturity_date),
        (ISSUE_DATE, ISSUE_DATE, MATURITY)
    );
    assert_eq!(
        s.next_coupon_date, NEXT_COUPON,
        "issue + 6 months, Almaty midnight"
    );
    assert_eq!(s.status, SeriesStatus::Active as u8);
    assert_eq!(
        (s.total_issued, s.action_count, s.quorum_bps, s.approval_bps),
        (0, 0, 5000, 6667)
    );

    let vault = get_associated_token_address_with_program_id(&series, &cash, &spl_token::ID);
    assert_eq!(s.tax_vault, vault);
    let acc = env.svm.get_account(&vault).expect("tax vault created");
    let ta = spl_token::state::Account::unpack(&acc.data).unwrap();
    assert_eq!((ta.mint, ta.owner), (cash, series));
}

/// Bond mint variant that `init_series` must reject with `expected`.
fn rejects(opts: BondMintOpts, expected: QuponError) {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, _) = env.create_bond_mint(opts);
    let ix = env.init_series_ix(mint, cash, spl_token::ID, env.params());
    assert_err(env.send(&[ix], &[]), expected);
}

#[test]
fn init_series_rejects_missing_extensions() {
    for e in [
        ExtensionType::MetadataPointer, // also drops TokenMetadata (token-2022 needs the pointer)
        ExtensionType::DefaultAccountState,
        ExtensionType::PermanentDelegate,
        ExtensionType::Pausable,
        ExtensionType::MintCloseAuthority,
    ] {
        rejects(
            BondMintOpts {
                omit: Some(e),
                ..Default::default()
            },
            QuponError::InvalidMintExtensions,
        );
    }
}

#[test]
fn init_series_rejects_unlisted_extension_and_decimals() {
    rejects(
        BondMintOpts {
            non_transferable: true,
            ..Default::default()
        },
        QuponError::InvalidMintExtensions,
    );
    rejects(
        BondMintOpts {
            decimals: 2,
            ..Default::default()
        },
        QuponError::InvalidMintExtensions,
    );
}

#[test]
fn init_series_rejects_foreign_authorities() {
    let rogue = Keypair::new().pubkey();
    rejects(
        BondMintOpts {
            permanent_delegate: Some(rogue),
            ..Default::default()
        },
        QuponError::InvalidAuthority,
    );
    rejects(
        BondMintOpts {
            pausable_authority: Some(rogue),
            ..Default::default()
        },
        QuponError::InvalidAuthority,
    );
    rejects(
        BondMintOpts {
            metadata_update_authority: Some(rogue),
            ..Default::default()
        },
        QuponError::InvalidAuthority,
    );
    rejects(
        BondMintOpts {
            keep_registrar_mint_authority: true,
            ..Default::default()
        },
        QuponError::InvalidAuthority,
    );
}

#[test]
fn init_series_token2022_cash_mint() {
    let mut env = Env::new();
    let tp = anchor_spl::token_2022::ID;
    let cash = env.create_cash_mint(tp);
    let (mint, series) = env.create_bond_mint(BondMintOpts::default());
    let ix = env.init_series_ix(mint, cash, tp, env.params());
    env.send(&[ix], &[])
        .expect("init_series with tKZT-like cash mint");
    let s: Series = env.account(&series);
    assert_eq!(
        s.tax_vault,
        get_associated_token_address_with_program_id(&series, &cash, &tp)
    );
    assert_eq!(env.svm.get_account(&s.tax_vault).unwrap().owner, tp);
}

#[test]
fn init_series_rejects_bad_params() {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, _) = env.create_bond_mint(BondMintOpts::default());
    let mut p = env.params();
    p.frequency = 3;
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    assert_err(env.send(&[ix], &[]), QuponError::InvalidParams);

    let mut p = env.params();
    p.day_count = 1; // ACT/ACT is reserved
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
    assert_err(env.send(&[ix], &[]), QuponError::UnsupportedDayCount);

    for (issue, maturity) in [
        (ISSUE_DATE, ISSUE_DATE),           // not after issue
        (ISSUE_DATE + 3600, MATURITY),      // not an Almaty midnight
        (ISSUE_DATE, NEXT_COUPON - 86_400), // matures before the first coupon
    ] {
        let mut p = env.params();
        (p.issue_date, p.maturity_date) = (issue, maturity);
        let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
        assert_err(env.send(&[ix], &[]), QuponError::InvalidDates);
    }
}
