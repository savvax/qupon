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
    let holders: Vec<_> = env
        .holders(&b, &[10, 25, 65])
        .iter()
        .map(|(k, u)| (k.pubkey(), *u))
        .collect();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");
    env.set_clock(now + 60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");
    (env, b, holders)
}

/// Independent recomputation of the order-independent set hash (hash_scheme 1, plan 15 D3):
/// XOR over holders of sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le).
fn expected_hash(b: &Bond, holders: &[(anchor_lang::prelude::Pubkey, u64)]) -> [u8; 32] {
    let action = action_pda(&b.series, 0);
    holders.iter().fold([0u8; 32], |mut acc, (owner, units)| {
        let mut h = Sha256::new();
        h.update(b"qupon:snap:v1");
        h.update(action.as_ref());
        h.update(owner.as_ref());
        h.update(units.to_le_bytes());
        let leaf: [u8; 32] = h.finalize().into();
        for (a, l) in acc.iter_mut().zip(leaf) {
            *a ^= l;
        }
        acc
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
    assert_eq!(a.snapshot_hash, expected_hash(&b, &holders));
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
        expected_hash(&b, &holders),
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
    // Striking is permissionless (plan 15 D2): the record date is due, so anyone may freeze the register.
    let ix = env.strike_ix(&b, &mallory.pubkey(), 0);
    env.send(&[ix], &[&mallory]).expect("anyone may strike");
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

#[test]
fn snapshot_review_paths() {
    // Duplicate holder in one batch is counted once; anyone may crank (plan 15 D2), re-sending is a no-op.
    let (mut env, b, holders) = struck();
    let a0 = holders[0].0;
    let mut ix = env.snapshot_ix(&b, 0, &[a0]);
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    ix.accounts[0].pubkey = mallory.pubkey();
    env.send(&[ix], &[&mallory]).expect("anyone snapshots");

    let mut ix = env.snapshot_ix(&b, 0, &[a0, a0]);
    let pa = env.paying_agent.insecure_clone();
    ix.accounts[0].pubkey = pa.pubkey();
    env.send(&[ix], &[&pa]).expect("paying agent cranks");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(
        (a.holders_snapshotted, a.units_snapshotted),
        (1, holders[0].1)
    );
}

#[test]
fn finalize_requires_holders_and_meeting_opens_voting() {
    // No units outstanding: nothing to snapshot → NothingToDo.
    let mut env = Env::new();
    let b = env.setup_bond();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).expect("announce");
    env.set_clock(now + 60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");
    let ix = env.finalize_snapshot_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::NothingToDo);

    // BMET: finalize_snapshot opens voting.
    let mut env = Env::new();
    let b = env.setup_bond();
    let owners: Vec<_> = env
        .holders(&b, &[10, 25])
        .iter()
        .map(|(k, _)| k.pubkey())
        .collect();
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
    let ix = env.announce_ix(&b, &env.issuer.pubkey(), args);
    let issuer = env.issuer.insecure_clone();
    env.send(&[ix], &[&issuer]).expect("BMET");
    env.set_clock(now + 60);
    let ix = env.strike_ix(&b, &env.registrar.pubkey(), 0);
    env.send(&[ix], &[]).expect("strike");
    let ix = env.snapshot_ix(&b, 0, &owners);
    env.send(&[ix], &[]).expect("snapshot");
    let ix = env.finalize_snapshot_ix(&b, 0);
    env.send(&[ix], &[]).expect("finalize");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(
        (a.status, a.units_snapshotted, a.total_gross),
        (ActionStatus::VotingOpen as u8, 35, 0)
    );
}

/// Flip the bond mint's Pausable flag off directly in the SVM. On-chain only the series PDA can
/// resume the mint, and it never does while an action is RecordStruck, so this is the only
/// reachable path to exercise the `MintNotPaused` guard.
fn force_resume(env: &mut Env, mint: &anchor_lang::prelude::Pubkey) {
    use anchor_spl::token_2022::spl_token_2022::{
        extension::{pausable::PausableConfig, BaseStateWithExtensionsMut, StateWithExtensionsMut},
        state::Mint as MintState,
    };
    let mut acc = env.svm.get_account(mint).expect("mint");
    let mut data = acc.data.clone();
    let mut state = StateWithExtensionsMut::<MintState>::unpack(&mut data).unwrap();
    state.get_extension_mut::<PausableConfig>().unwrap().paused = false.into();
    state.pack_base();
    acc.data = data;
    env.svm.set_account(*mint, acc).expect("force resume");
}

#[test]
fn snapshot_rejects_substituted_accounts_and_unpaused_mint() {
    let (mut env, b, holders) = struck();
    let owners: Vec<_> = holders.iter().map(|(o, _)| *o).collect();
    let a0 = action_pda(&b.series, 0);

    // A second bond whose Investor PDA belongs to another series.
    let b2 = env.setup_bond();
    let y = Keypair::new();
    env.register(&b2, &y.pubkey()).expect("register in B");

    // Non-registered ATA in place of the holder's own: [Investor, bond ATA, Entitlement] triples start at meta 5.
    let stranger = Keypair::new();
    let mut ix = env.snapshot_ix(&b, 0, &owners);
    ix.accounts[6].pubkey = ata(&stranger.pubkey(), &b.mint, &spl_token_2022::ID);
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // Investor from another series.
    let mut ix = env.snapshot_ix(&b, 0, &owners);
    ix.accounts[5].pubkey = investor_pda(&b2.series, &y.pubkey());
    assert_err(env.send(&[ix], &[]), QuponError::AccountOwnerMismatch);

    // Entitlement PDA of an owner who is not the one in this triple.
    let mut ix = env.snapshot_ix(&b, 0, &owners);
    ix.accounts[7].pubkey = entitlement_pda(&a0, &y.pubkey());
    assert_err(env.send(&[ix], &[]), QuponError::InvalidParams);

    // Mint not paused: the test resumes it directly; on-chain this pair of states is unreachable.
    force_resume(&mut env, &b.mint);
    let ix = env.snapshot_ix(&b, 0, &owners);
    assert_err(env.send(&[ix], &[]), QuponError::MintNotPaused);
}
