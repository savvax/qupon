mod common;

use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{
    error::QuponError, ActionStatus, CorporateAction, Entitlement, EntitlementStatus, Series,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const NEXT_COUPON_2: i64 = 1_814_554_800; // 2027-07-03 00:00 Asia/Almaty = issue + 12 months

/// Brief holders with INTR #1 snapshotted; issuer holds `cash` in its cash ATA.
fn snapshotted(holdings: &[(u64, u16)], cash: u64) -> (Env, Bond, Vec<(Keypair, u64)>) {
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders_with_tax(&b, holdings);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    env.intr_snapshotted(&b, &owners);
    env.issuer_cash(&b);
    let issuer = env.issuer.pubkey();
    env.fund_cash(&b, &issuer, cash);
    (env, b, holders)
}

fn owners(h: &[(Keypair, u64)]) -> Vec<anchor_lang::prelude::Pubkey> {
    h.iter().map(|(k, _)| k.pubkey()).collect()
}

#[test]
fn brief_coupon_end_to_end() {
    let (mut env, b, holders) = snapshotted(&[(10, 0), (25, 0), (65, 0)], 500_000);
    let issuer = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 500_000); // 5,000.00 KZT
    env.send(&[ix], &[&issuer]).expect("fund");
    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    assert_eq!(a.status, ActionStatus::Funded as u8);

    let ix = env.pay_ix(&b, 0, &owners(&holders));
    env.send(&[ix], &[]).expect("pay");
    for (k, units) in &holders {
        let paid = env.balance(&ata(&k.pubkey(), &b.cash, &b.cash_tp));
        let want = match units {
            10 => 50_000,  // 500.00 KZT — the brief's example
            25 => 125_000, // 1,250.00
            65 => 325_000, // 3,250.00
            _ => unreachable!(),
        };
        assert_eq!(paid, want, "{units} units");
        let e: Entitlement = env.account(&entitlement_pda(&pda, &k.pubkey()));
        assert_eq!(e.status, EntitlementStatus::Paid as u8);
    }
    assert_eq!(
        env.balance(&ata(&pda, &b.cash, &b.cash_tp)),
        0,
        "escrow emptied"
    );

    let ix = env.complete_ix(&b, 0);
    env.send(&[ix], &[]).expect("complete");
    let a: CorporateAction = env.account(&pda);
    assert_eq!(
        (a.status, a.holders_paid, a.total_paid),
        (ActionStatus::Completed as u8, 3, 500_000)
    );
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.period_start, s.next_coupon_date, s.open_action),
        (NEXT_COUPON, NEXT_COUPON_2, None)
    );

    // The register is live again: a holder can transfer.
    let (from, to) = (&holders[0].0, holders[1].0.pubkey());
    let t = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::ID,
        &ata(&from.pubkey(), &b.mint, &spl_token_2022::ID),
        &b.mint,
        &ata(&to, &b.mint, &spl_token_2022::ID),
        &from.pubkey(),
        &[],
        1,
        0,
    )
    .unwrap();
    env.send(&[t], &[from]).expect("transfer after resume");
}

#[test]
fn underfunded_and_incomplete_payments_are_refused() {
    let (mut env, b, holders) = snapshotted(&[(10, 0), (25, 0), (65, 0)], 500_000);
    let issuer = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 100_000);
    env.send(&[ix], &[&issuer]).expect("partial fund");
    let ix = env.pay_ix(&b, 0, &owners(&holders));
    assert_err(env.send(&[ix], &[]), QuponError::Underfunded);

    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 400_000);
    env.send(&[ix], &[&issuer]).expect("rest of funding");
    let ix = env.pay_ix(&b, 0, &owners(&holders)[..2]);
    env.send(&[ix], &[]).expect("pay two");
    let ix = env.complete_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::PaymentsIncomplete);

    // Re-sending the same batch (and a duplicate inside it) pays nobody twice.
    let mut dup = owners(&holders)[..2].to_vec();
    dup.push(dup[0]);
    let ix = env.pay_ix(&b, 0, &dup);
    env.send(&[ix], &[]).expect("idempotent re-run");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(a.holders_paid, 2);

    let ix = env.pay_ix(&b, 0, &owners(&holders)[2..]);
    env.send(&[ix], &[]).expect("pay last");
    let ix = env.complete_ix(&b, 0);
    env.send(&[ix], &[]).expect("complete");
}

#[test]
fn withholding_tax_goes_to_tax_vault() {
    let (mut env, b, holders) = snapshotted(&[(10, 1000)], 50_000);
    let issuer = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 50_000);
    env.send(&[ix], &[&issuer]).expect("fund");
    let ix = env.pay_ix(&b, 0, &owners(&holders));
    env.send(&[ix], &[]).expect("pay");
    // fixtures: tax_10pct → gross 50,000, tax 5,000, net 45,000
    assert_eq!(
        env.balance(&ata(&holders[0].0.pubkey(), &b.cash, &b.cash_tp)),
        45_000
    );
    assert_eq!(env.balance(&ata(&b.series, &b.cash, &b.cash_tp)), 5_000);
    let ix = env.complete_ix(&b, 0);
    env.send(&[ix], &[]).expect("complete");
}

#[test]
fn only_issuer_or_paying_agent_funds() {
    let (mut env, b, _) = snapshotted(&[(10, 0)], 50_000);
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    // Give mallory a funded cash account so the only thing standing in the way is the signer check.
    let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(), &mallory.pubkey(), &b.cash, &b.cash_tp,
    );
    env.send(&[create], &[]).expect("mallory cash ATA");
    env.fund_cash(&b, &mallory.pubkey(), 10);
    let ix = env.fund_ix(&b, &mallory.pubkey(), 0, 1);
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);

    // Paying is permissionless (plan 15 D2) but money cannot leave an unfunded escrow.
    let ix = env.pay_ix(&b, 0, &[]);
    let mut ix2 = ix.clone();
    ix2.accounts[0].pubkey = mallory.pubkey();
    assert_err(env.send(&[ix2], &[&mallory]), QuponError::Underfunded);
}

#[test]
fn pay_batch_rejects_substituted_accounts() {
    let (mut env, b, holders) = snapshotted(&[(10, 0), (25, 0), (65, 0)], 500_000);
    let issuer = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 500_000);
    env.send(&[ix], &[&issuer]).expect("fund");
    let owners = owners(&holders);

    // A second bond with a snapshotted entitlement of its own: action 0 of B ≠ action 0 of A.
    let b2 = env.setup_bond();
    let y = Keypair::new();
    env.register(&b2, &y.pubkey()).expect("register in B");
    let ix = env.issue_ix(&b2, &issuer.pubkey(), &y.pubkey(), 10);
    env.send(&[ix], &[&issuer]).expect("issue in B");
    let now = env.now();
    let ix = env.announce_ix(&b2, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce in B");
    env.set_clock(now + 60);
    for ix in [
        env.strike_ix(&b2, &env.registrar.pubkey(), 0),
        env.snapshot_ix(&b2, 0, &[y.pubkey()]),
    ] {
        env.send(&[ix], &[]).expect("record date in B");
    }
    let foreign_ent = entitlement_pda(&action_pda(&b2.series, 0), &y.pubkey());

    // Entitlement from another action: [Entitlement, Investor, cash ATA] triples start at meta 7.
    let mut ix = env.pay_ix(&b, 0, &owners);
    ix.accounts[7].pubkey = foreign_ent;
    assert_err(env.send(&[ix], &[]), QuponError::InvalidParams);

    // Investor from another series.
    let mut ix = env.pay_ix(&b, 0, &owners);
    ix.accounts[8].pubkey = investor_pda(&b2.series, &y.pubkey());
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // Cash ATA of an attacker instead of the holder's registered one.
    let attacker = Keypair::new();
    let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(), &attacker.pubkey(), &b.cash, &b.cash_tp,
    );
    env.send(&[create], &[]).expect("attacker cash ATA");
    let mut ix = env.pay_ix(&b, 0, &owners);
    ix.accounts[9].pubkey = ata(&attacker.pubkey(), &b.cash, &b.cash_tp);
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // Nobody was paid while the substitutions were refused.
    assert_eq!(
        env.balance(&ata(&action_pda(&b.series, 0), &b.cash, &b.cash_tp)),
        500_000,
        "escrow untouched"
    );
}

#[test]
fn complete_action_while_funded_is_refused() {
    let (mut env, b, _) = snapshotted(&[(10, 0)], 50_000);
    let issuer = env.issuer.insecure_clone();
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, 50_000);
    env.send(&[ix], &[&issuer]).expect("fund");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(a.status, ActionStatus::Funded as u8);
    let ix = env.complete_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
}
