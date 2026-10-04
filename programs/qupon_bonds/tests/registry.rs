mod common;

use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{error::QuponError, Investor, InvestorStatus, Series};
use solana_keypair::Keypair;
use solana_signer::Signer;

const FACE: u64 = 100_000;

#[test]
fn register_then_subscribe_is_dvp() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let alice = Keypair::new();
    env.svm.airdrop(&alice.pubkey(), 1_000_000_000).unwrap();
    env.register(&b, &alice.pubkey()).expect("register");

    let inv: Investor = env.account(&investor_pda(&b.series, &alice.pubkey()));
    let bond_ata = ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID);
    let cash_ata = ata(&alice.pubkey(), &b.cash, &b.cash_tp);
    assert_eq!(
        (inv.owner, inv.bond_ata, inv.cash_ata),
        (alice.pubkey(), bond_ata, cash_ata)
    );
    assert_eq!(inv.status, InvestorStatus::Active as u8);
    assert!(!env.is_frozen(&bond_ata), "registration thaws the bond ATA");

    env.fund_cash(&b, &alice.pubkey(), 1_500_000);
    let ix = env.subscribe_ix(&b, &alice.pubkey(), 10, FACE);
    env.send(&[ix], &[&alice]).expect("subscribe");

    let issuer_cash = ata(&env.issuer.pubkey(), &b.cash, &b.cash_tp);
    assert_eq!(env.balance(&bond_ata), 10, "bond leg");
    assert_eq!(
        env.balance(&cash_ata),
        500_000,
        "cash leg: 1,500,000 - 10 x 100,000"
    );
    assert_eq!(env.balance(&issuer_cash), 1_000_000);
    let s: Series = env.account(&b.series);
    assert_eq!(s.total_issued, 10);
}

#[test]
fn unregistered_wallet_cannot_receive_bonds() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let (alice, bob, outsider) = (Keypair::new(), Keypair::new(), Keypair::new());
    for k in [&alice, &bob] {
        env.register(&b, &k.pubkey()).expect("register");
    }
    let ix = env.issue_ix(&b, &env.issuer.pubkey(), &alice.pubkey(), 5);
    let issuer = env.issuer.insecure_clone();
    env.send(&[ix], &[&issuer]).expect("issue_units");

    // Anyone can create the outsider's ATA, but DefaultAccountState=Frozen keeps it frozen.
    let outsider_ata = ata(&outsider.pubkey(), &b.mint, &spl_token_2022::ID);
    let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(), &outsider.pubkey(), &b.mint, &spl_token_2022::ID,
    );
    env.send(&[create], &[]).expect("create outsider ATA");
    assert!(env.is_frozen(&outsider_ata));

    let transfer = |to: &solana_keypair::Keypair| {
        spl_token_2022::instruction::transfer_checked(
            &spl_token_2022::ID,
            &ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID),
            &b.mint,
            &ata(&to.pubkey(), &b.mint, &spl_token_2022::ID),
            &alice.pubkey(),
            &[],
            1,
            0,
        )
        .unwrap()
    };
    let res = env.send(&[transfer(&outsider)], &[&alice]);
    let err = format!(
        "{:?}",
        res.expect_err("transfer to a frozen (unregistered) ATA must fail")
            .err
    );
    assert!(
        err.contains("Custom(17)"),
        "TokenError::AccountFrozen, got {err}"
    );
    assert_eq!(env.balance(&outsider_ata), 0);

    // Control: the same transfer to a registered holder works.
    env.send(&[transfer(&bob)], &[&alice])
        .expect("transfer to registered holder");
    assert_eq!(
        env.balance(&ata(&bob.pubkey(), &b.mint, &spl_token_2022::ID)),
        1
    );
}

#[test]
fn suspended_investor_cannot_subscribe_until_reinstated() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let alice = Keypair::new();
    env.register(&b, &alice.pubkey()).expect("register");
    env.fund_cash(&b, &alice.pubkey(), 1_000_000);
    let bond_ata = ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID);

    let ix = env.set_status_ix(&b, &alice.pubkey(), true);
    env.send(&[ix], &[]).expect("suspend");
    assert!(env.is_frozen(&bond_ata));
    let ix = env.subscribe_ix(&b, &alice.pubkey(), 1, FACE);
    assert_err(env.send(&[ix], &[&alice]), QuponError::InvestorSuspended);
    let ix = env.set_status_ix(&b, &alice.pubkey(), true);
    assert_err(env.send(&[ix], &[]), QuponError::InvestorSuspended);

    let ix = env.set_status_ix(&b, &alice.pubkey(), false);
    env.send(&[ix], &[]).expect("reinstate");
    assert!(!env.is_frozen(&bond_ata));
    let ix = env.subscribe_ix(&b, &alice.pubkey(), 1, FACE);
    env.send(&[ix], &[&alice])
        .expect("subscribe after reinstate");
    assert_eq!(env.balance(&bond_ata), 1);
}

#[test]
fn subscribe_rejects_insufficient_cash_and_off_par_price() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let alice = Keypair::new();
    env.register(&b, &alice.pubkey()).expect("register");
    env.fund_cash(&b, &alice.pubkey(), 99_999);

    let ix = env.subscribe_ix(&b, &alice.pubkey(), 1, FACE);
    let err = format!(
        "{:?}",
        env.send(&[ix], &[&alice])
            .expect_err("insufficient cash")
            .err
    );
    assert!(
        err.contains("Custom(1)"),
        "TokenError::InsufficientFunds, got {err}"
    );

    let ix = env.subscribe_ix(&b, &alice.pubkey(), 1, 1);
    assert_err(env.send(&[ix], &[&alice]), QuponError::InvalidParams);
    let ix = env.subscribe_ix(&b, &alice.pubkey(), 0, FACE);
    assert_err(env.send(&[ix], &[&alice]), QuponError::NothingToDo);
    assert_eq!(
        env.balance(&ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID)),
        0
    );
}

#[test]
fn only_registrar_registers_and_only_issuer_issues() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let (alice, mallory) = (Keypair::new(), Keypair::new());
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();

    let ix = env.register_ix(&b, &mallory.pubkey(), &alice.pubkey());
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);

    env.register(&b, &alice.pubkey()).expect("register");
    let ix = env.issue_ix(&b, &mallory.pubkey(), &alice.pubkey(), 1);
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);
    assert_eq!(
        env.balance(&ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID)),
        0
    );
}
