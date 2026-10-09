//! Holder-chosen payout route (plan 15 D6, task 1514): only the holder picks wallet or bank; bank-routed payouts
//! go to the paying agent's cash account and need the agent's confirmation (reference hash) before completion.
mod common;

use anchor_lang::{
    prelude::Pubkey,
    solana_program::{instruction::Instruction, system_program},
    InstructionData, ToAccountMetas,
};
use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{error::QuponError, Entitlement, EntitlementStatus};
use solana_keypair::Keypair;
use solana_signer::Signer;

const BANK: u8 = 1;

fn set_route_ix(b: &Bond, owner: &Pubkey, route: u8, hash: [u8; 32]) -> Instruction {
    let investor = investor_pda(&b.series, owner);
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::SetPayoutRoute {
            route,
            bank_ref_hash: hash,
        }
        .data(),
        qupon_bonds::accounts::SetPayoutRoute {
            owner: *owner,
            series: b.series,
            investor,
            route: route_pda(&investor),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn confirm_ix(b: &Bond, agent: &Pubkey, owner: &Pubkey, hash: [u8; 32]) -> Instruction {
    let action = action_pda(&b.series, 0);
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::ConfirmBankPayout {
            reference_hash: hash,
        }
        .data(),
        qupon_bonds::accounts::ConfirmBankPayout {
            paying_agent: *agent,
            series: b.series,
            action,
            entitlement: entitlement_pda(&action, owner),
        }
        .to_account_metas(None),
    )
}

/// `pay_ix` with holder `k`'s destination replaced (per-holder groups of 5 start at meta 9; destination is +3).
fn pay_with_dest(env: &Env, b: &Bond, owners: &[Pubkey], k: usize, dest: Pubkey) -> Instruction {
    let mut ix = env.pay_ix(b, 0, owners);
    ix.accounts[9 + 5 * k + 3].pubkey = dest;
    ix
}

/// Legacy series (maturity `maturity`), holders 10 / 25 / 65; action 0 (`kind`) snapshotted and fully funded; the
/// paying agent has a cash account. Returns holder keypairs sorted by owner.
fn funded(kind: u8, maturity: Option<i64>) -> (Env, Bond, Vec<Keypair>) {
    let mut env = Env::new();
    let b = match maturity {
        Some(m) => env.setup_bond_with(|p| p.maturity_date = m),
        None => env.setup_bond(),
    };
    let h: Vec<Keypair> = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    for k in &h {
        env.svm.airdrop(&k.pubkey(), 1_000_000_000).unwrap();
    }
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    let now = env.now();
    let args = qupon_bonds::AnnounceArgs {
        kind,
        corp_id: corp_id(if kind == 1 {
            "QPNb1-REDM-0001"
        } else {
            "QPNb1-INTR-0001"
        }),
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
    let a: qupon_bonds::CorporateAction = env.account(&action_pda(&b.series, 0));
    let required = a.total_net + a.total_tax + a.total_principal;
    env.issuer_cash(&b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(&b, &issuer.pubkey(), required);
    let ix = env.fund_ix(&b, &issuer.pubkey(), 0, required);
    env.send(&[ix], &[&issuer]).unwrap();
    let create = anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(), &env.paying_agent.pubkey(), &b.cash, &b.cash_tp,
    );
    env.send(&[create], &[]).unwrap();
    (env, b, h)
}

#[test]
fn only_the_holder_can_choose_the_route() {
    let (mut env, b, h) = funded(0, None);
    let owner = h[0].pubkey();
    // The registrar cannot redirect a holder's payouts.
    let mut ix = set_route_ix(&b, &owner, BANK, [7; 32]);
    ix.accounts[0].pubkey = env.registrar.pubkey();
    assert_err(env.send(&[ix], &[]), QuponError::Unauthorized);
    // A bank route needs the hash of the bank details; a wallet route must not carry one.
    assert_err(
        env.send(&[set_route_ix(&b, &owner, BANK, [0; 32])], &[&h[0]]),
        QuponError::InvalidParams,
    );
    env.send(&[set_route_ix(&b, &owner, BANK, [7; 32])], &[&h[0]])
        .expect("the holder chooses bank");
    env.send(&[set_route_ix(&b, &owner, 0, [0; 32])], &[&h[0]])
        .expect("and can switch back to the wallet");
}

#[test]
fn a_bank_payout_goes_to_the_agent_and_needs_confirmation_before_complete() {
    let (mut env, b, h) = funded(0, None);
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    env.send(&[set_route_ix(&b, &owners[1], BANK, [7; 32])], &[&h[1]])
        .unwrap();
    let agent = env.paying_agent.insecure_clone();
    let agent_cash = ata(&agent.pubkey(), &b.cash, &b.cash_tp);
    let ix = pay_with_dest(&env, &b, &owners, 1, agent_cash);
    env.send(&[ix], &[]).expect("pay");
    let units = env.balance(&ata(&owners[1], &b.mint, &spl_token_2022::ID));
    assert_eq!(
        env.balance(&agent_cash),
        units * 5_000,
        "the agent received holder 1's coupon"
    );
    assert_eq!(env.balance(&ata(&owners[1], &b.cash, &b.cash_tp)), 0);
    assert_err(
        env.send(&[env.complete_ix(&b, 0)], &[]),
        QuponError::BankPayoutsPending,
    );
    env.send(
        &[confirm_ix(&b, &agent.pubkey(), &owners[1], [9; 32])],
        &[&agent],
    )
    .expect("agent confirms the bank transfer");
    let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 0), &owners[1]));
    assert_eq!(e.status, EntitlementStatus::Paid as u8);
    env.send(&[env.complete_ix(&b, 0)], &[]).expect("complete");
}

#[test]
fn a_bank_routed_payout_cannot_go_anywhere_else() {
    let (mut env, b, h) = funded(0, None);
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    env.send(&[set_route_ix(&b, &owners[0], BANK, [7; 32])], &[&h[0]])
        .unwrap();
    // The holder's own wallet account is no longer valid, nor is a stranger's: that holder is skipped (nothing
    // moves, still Snapshotted) and the rest of the batch is paid — a route flip cannot fail other holders.
    let stranger = Keypair::new().pubkey();
    let ix = pay_with_dest(&env, &b, &owners, 0, ata(&stranger, &b.cash, &b.cash_tp));
    env.send(&[ix], &[]).expect("batch goes through");
    env.send(&[env.pay_ix(&b, 0, &owners)], &[])
        .expect("again with the wallet account");
    let action = action_pda(&b.series, 0);
    let e: Entitlement = env.account(&entitlement_pda(&action, &owners[0]));
    assert_eq!(e.status, EntitlementStatus::Snapshotted as u8);
    assert_eq!(env.balance(&ata(&owners[0], &b.cash, &b.cash_tp)), 0);
    let e1: Entitlement = env.account(&entitlement_pda(&action, &owners[1]));
    assert_eq!(e1.status, EntitlementStatus::Paid as u8);
}

#[test]
fn only_the_paying_agent_confirms() {
    let (mut env, b, h) = funded(0, None);
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    env.send(&[set_route_ix(&b, &owners[0], BANK, [7; 32])], &[&h[0]])
        .unwrap();
    let agent_cash = ata(&env.paying_agent.pubkey(), &b.cash, &b.cash_tp);
    let ix = pay_with_dest(&env, &b, &owners, 0, agent_cash);
    env.send(&[ix], &[]).unwrap();
    let ix = confirm_ix(&b, &env.registrar.pubkey(), &owners[0], [1; 32]);
    assert_err(env.send(&[ix], &[]), QuponError::Unauthorized);
    // A wallet-paid entitlement has nothing to confirm.
    let agent = env.paying_agent.insecure_clone();
    let ix = confirm_ix(&b, &agent.pubkey(), &owners[1], [1; 32]);
    assert_err(env.send(&[ix], &[&agent]), QuponError::WrongStatus);
}

#[test]
fn a_bank_routed_redemption_burns_now_and_retires_on_confirmation() {
    let (mut env, b, h) = funded(1, Some(NEXT_COUPON));
    let owners: Vec<Pubkey> = h.iter().map(|k| k.pubkey()).collect();
    env.send(&[set_route_ix(&b, &owners[2], BANK, [7; 32])], &[&h[2]])
        .unwrap();
    let agent = env.paying_agent.insecure_clone();
    let agent_cash = ata(&agent.pubkey(), &b.cash, &b.cash_tp);
    let ix = pay_with_dest(&env, &b, &owners, 2, agent_cash);
    env.send(&[ix], &[]).expect("pay + burn");
    assert_eq!(
        env.balance(&ata(&owners[2], &b.mint, &spl_token_2022::ID)),
        0
    );
    env.send(
        &[confirm_ix(&b, &agent.pubkey(), &owners[2], [9; 32])],
        &[&agent],
    )
    .unwrap();
    let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 0), &owners[2]));
    assert_eq!(e.status, EntitlementStatus::Retired as u8);
    env.send(&[env.complete_ix(&b, 0)], &[]).expect("complete");
    env.send(&[env.retire_ix(&b, 0, &owners)], &[])
        .expect("retire is a no-op (no double count)");
    env.send(&[env.close_series_ix(&b, 0)], &[]).expect("close");
}
