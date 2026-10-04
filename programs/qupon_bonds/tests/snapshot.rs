mod common;

use anchor_spl::token_2022::spl_token_2022;
use common::*;
use qupon_bonds::{
    error::QuponError, ActionStatus, CorporateAction, Entitlement, EntitlementStatus,
};
use sha2::{Digest, Sha256};
use solana_keypair::Keypair;
use solana_signer::Signer;

/// Brief holders 10/25/65, INTR #1 announced and its record date reached. Returns (bond, sorted holders).
fn struck() -> (Env, Bond, Vec<(anchor_lang::prelude::Pubkey, u64)>) {
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders(&b, &[10, 25, 65]);
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");
    env.set_clock(now + 60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");
    (env, b, holders)
}

/// Independent recomputation: sha256 chain over holders sorted by owner, starting from 32 zero bytes.
fn expected_hash(holders: &[(anchor_lang::prelude::Pubkey, u64)]) -> [u8; 32] {
    holders.iter().fold([0u8; 32], |prev, (owner, units)| {
        let mut h = Sha256::new();
        h.update(prev);
        h.update(owner.as_ref());
        h.update(units.to_le_bytes());
        h.finalize().into()
    })
}

#[test]
fn snapshot_one_batch_matches_brief_and_hash() {
    let (mut env, b, holders) = struck();
    let owners: Vec<_> = holders.iter().map(|(o, _)| *o).collect();
    let ix = env.snapshot_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("snapshot");
    let ix = env.finalize_snapshot_ix(&b, 0);
    env.send(&[ix], &[]).expect("finalize");

    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    assert_eq!(a.status, ActionStatus::SnapshotComplete as u8);
    assert_eq!((a.units_snapshotted, a.holders_snapshotted), (100, 3));
    assert_eq!(
        (a.total_gross, a.total_tax, a.total_net),
        (500_000, 0, 500_000)
    );
    assert_eq!(a.snapshot_hash, expected_hash(&holders));
    for (owner, units) in &holders {
        let e: Entitlement = env.account(&entitlement_pda(&pda, owner));
        assert_eq!((e.owner, e.units), (*owner, *units));
        assert_eq!(
            e.gross,
            units * 5_000,
            "10 → 50,000 tiyn (500.00 KZT), 25 → 1,250.00, 65 → 3,250.00"
        );
        assert_eq!(
            (e.net, e.principal, e.status),
            (e.gross, 0, EntitlementStatus::Snapshotted as u8)
        );
    }
}

#[test]
fn snapshot_in_two_batches_is_idempotent() {
    let (mut env, b, holders) = struck();
    let owners: Vec<_> = holders.iter().map(|(o, _)| *o).collect();
    let pda = action_pda(&b.series, 0);

    let ix = env.snapshot_ix(&b, 0, &owners[..2]);
    env.send(&[ix], &[]).expect("batch 1");
    let after_first = env.svm.get_account(&pda).unwrap().data;
    let ix = env.snapshot_ix(&b, 0, &owners[..2]);
    env.send(&[ix], &[]).expect("batch 1 again");
    assert_eq!(
        env.svm.get_account(&pda).unwrap().data,
        after_first,
        "re-run changes nothing"
    );

    let ix = env.finalize_snapshot_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::SupplyMismatch);

    let ix = env.snapshot_ix(&b, 0, &owners[2..]);
    env.send(&[ix], &[]).expect("batch 2");
    let ix = env.finalize_snapshot_ix(&b, 0);
    env.send(&[ix], &[]).expect("finalize");
    let a: CorporateAction = env.account(&pda);
    assert_eq!((a.units_snapshotted, a.total_gross), (100, 500_000));
    assert_eq!(
        a.snapshot_hash,
        expected_hash(&holders),
        "same hash as one batch"
    );
}

#[test]
fn strike_guards() {
    let mut env = Env::new();
    let b = env.setup_bond();
    env.holders(&b, &[10]);
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");

    let ix = env.snapshot_ix(&b, 0, &[]);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    assert_err(env.send(&[ix], &[]), QuponError::TooEarly);

    env.set_clock(now + 60);
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let ix = env.strike_ix(&b, &mallory.pubkey(), 0);
    assert_err(env.send(&[ix], &[&mallory]), QuponError::Unauthorized);

    let pa = env.paying_agent.insecure_clone();
    let ix = env.strike_ix(&b, &pa.pubkey(), 0);
    env.send(&[ix], &[&pa]).expect("paying agent may strike");
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    assert_err(env.send(&[ix], &[]), QuponError::WrongStatus);
}

#[test]
fn register_is_frozen_while_paused() {
    let (mut env, b, holders) = struck();
    let (from, to) = (holders[0].0, holders[1].0);
    // Holder keys are not kept by `holders()`; use the issuer path instead: minting is paused too.
    let issuer = env.issuer.insecure_clone();
    let ix = env.issue_ix(&b, &issuer.pubkey(), &from, 1);
    assert_err(env.send(&[ix], &[&issuer]), QuponError::MintPaused);

    // A holder transfer is rejected by Token-2022 itself while the mint is paused.
    let alice = Keypair::new();
    env.register(&b, &alice.pubkey()).expect("register");
    let t = spl_token_2022::instruction::transfer_checked(
        &spl_token_2022::ID,
        &ata(&alice.pubkey(), &b.mint, &spl_token_2022::ID),
        &b.mint,
        &ata(&to, &b.mint, &spl_token_2022::ID),
        &alice.pubkey(),
        &[],
        0,
        0,
    )
    .unwrap();
    let res = env.send(&[t], &[&alice]);
    assert!(res.is_err(), "transfer while paused must fail");
}

#[test]
fn batch_limits() {
    let (mut env, b, holders) = struck();
    let nine = vec![holders[0].0; 9];
    let ix = env.snapshot_ix(&b, 0, &nine);
    assert_err(env.send(&[ix], &[]), QuponError::BatchTooLarge);

    // Wrong entitlement PDA for the triple (owner of holder 0, PDA of holder 1).
    let mut ix = env.snapshot_ix(&b, 0, &[holders[0].0]);
    let wrong = entitlement_pda(&action_pda(&b.series, 0), &holders[1].0);
    let n = ix.accounts.len();
    ix.accounts[n - 1].pubkey = wrong;
    assert_err(env.send(&[ix], &[]), QuponError::InvalidParams);
}
