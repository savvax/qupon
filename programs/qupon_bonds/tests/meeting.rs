#![allow(clippy::result_large_err)] // TransactionResult is LiteSVM's type
mod common;

use common::*;
use qupon_bonds::{
    error::QuponError, ActionStatus, CorporateAction, Entitlement, MeetingResult, Series,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const FOR: u8 = 1;
const AGAINST: u8 = 2;
const ABSTAIN: u8 = 3;

/// Holders 10/25/65 (keypairs keyed by units), meeting proposing 12% open for voting.
fn meeting() -> (Env, Bond, Vec<(Keypair, u64)>, i64) {
    let mut env = Env::new();
    let b = env.setup_bond();
    let holders = env.holders(&b, &[10, 25, 65]);
    let owners: Vec<_> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let ends = env.open_meeting(&b, &owners, 1200);
    (env, b, holders, ends)
}

fn by_units(h: &[(Keypair, u64)], units: u64) -> &Keypair {
    &h.iter().find(|(_, u)| *u == units).unwrap().0
}

fn vote(env: &mut Env, b: &Bond, k: &Keypair, choice: u8) -> litesvm::types::TransactionResult {
    let ix = env.vote_ix(b, 0, &k.pubkey(), choice);
    env.send(&[ix], &[k])
}

#[test]
fn two_thirds_against_is_rejected() {
    let (mut env, b, h, _) = meeting();
    vote(&mut env, &b, by_units(&h, 10), FOR).expect("vote");
    vote(&mut env, &b, by_units(&h, 25), FOR).expect("vote");
    vote(&mut env, &b, by_units(&h, 65), AGAINST).expect("vote");
    let ix = env.finalize_meeting_ix(&b, 0); // everyone voted: may finalize before the window ends
    env.send(&[ix], &[]).expect("finalize");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(
        (a.votes_for, a.votes_against, a.result),
        (35, 65, MeetingResult::Rejected as u8)
    );
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.coupon_rate_bps, s.open_action),
        (1000, None),
        "rejected meeting frees the series"
    );
    let ix = env.apply_terms_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::NotApproved);
}

#[test]
fn approved_meeting_changes_the_next_coupon() {
    let (mut env, b, h, _) = meeting();
    vote(&mut env, &b, by_units(&h, 65), FOR).expect("vote");
    vote(&mut env, &b, by_units(&h, 25), AGAINST).expect("vote");
    vote(&mut env, &b, by_units(&h, 10), ABSTAIN).expect("vote");
    let ix = env.finalize_meeting_ix(&b, 0);
    env.send(&[ix], &[]).expect("finalize");
    let pda = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&pda);
    // 65 ≥ (65 + 25) × 66.67%; abstentions count toward quorum only.
    assert_eq!(
        (a.votes_for, a.votes_against, a.votes_abstain),
        (65, 25, 10)
    );
    assert_eq!(
        (a.status, a.result),
        (ActionStatus::Finalized as u8, MeetingResult::Approved as u8)
    );

    let ix = env.apply_terms_ix(&b, 0);
    let res = env.send(&[ix], &[]).expect("apply terms change");
    assert!(
        res.logs.iter().any(|l| l.contains("Program data:")),
        "TermsChanged emitted"
    );
    let s: Series = env.account(&b.series);
    assert_eq!((s.coupon_rate_bps, s.open_action), (1200, None));
    let a: CorporateAction = env.account(&pda);
    assert_eq!(a.status, ActionStatus::Completed as u8);
    let mint = env.svm.get_account(&b.mint).unwrap();
    let text = String::from_utf8_lossy(&mint.data);
    assert!(
        text.contains("coupon_rate_bps") && text.contains("1200"),
        "token metadata updated"
    );

    // Next INTR at 12%: per unit 6,000; 10 units → 60,000 (fixture new_rate_after_vote).
    let now = env.now();
    let mut args = intr_args(now);
    args.rate_bps = 1200;
    args.corp_id = corp_id("QPNb1-INTR-0001");
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), args);
    env.send(&[ix], &[]).expect("announce INTR at the new rate");
    let intr: CorporateAction = env.account(&action_pda(&b.series, 1));
    assert_eq!(intr.per_unit_gross, 6_000);
    env.set_clock(now + 60);
    let owners: Vec<_> = h.iter().map(|(k, _)| k.pubkey()).collect();
    for ix in [
        env.strike_ix(&b, &env.registrar.pubkey(), 1),
        env.snapshot_ix(&b, 1, &owners),
    ] {
        env.send(&[ix], &[]).expect("record date");
    }
    let ten = by_units(&h, 10).pubkey();
    let e: Entitlement = env.account(&entitlement_pda(&action_pda(&b.series, 1), &ten));
    assert_eq!(e.gross, 60_000, "600.00 KZT instead of 500.00");
}

#[test]
fn no_quorum_and_voting_rules() {
    let (mut env, b, h, ends) = meeting();
    let ten = by_units(&h, 10);
    vote(&mut env, &b, ten, FOR).expect("vote");
    assert_err(vote(&mut env, &b, ten, AGAINST), QuponError::AlreadyVoted);
    assert_err(
        vote(&mut env, &b, by_units(&h, 25), 0),
        QuponError::InvalidParams,
    );

    let ix = env.finalize_meeting_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::VotingOpen);

    env.set_clock(ends);
    assert_err(
        vote(&mut env, &b, by_units(&h, 25), FOR),
        QuponError::VotingClosed,
    );
    let ix = env.finalize_meeting_ix(&b, 0);
    env.send(&[ix], &[]).expect("finalize after the window");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(
        a.result,
        MeetingResult::NoQuorum as u8,
        "10 of 100 units < 50% quorum"
    );
    let ix = env.apply_terms_ix(&b, 0);
    assert_err(env.send(&[ix], &[]), QuponError::NotApproved);
}

#[test]
fn only_the_holder_votes_with_their_weight() {
    let (mut env, b, h, _) = meeting();
    // Mallory signs with Alice's entitlement: seeds bind the entitlement to the signer.
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let mut ix = env.vote_ix(&b, 0, &by_units(&h, 65).pubkey(), FOR);
    ix.accounts[0].pubkey = mallory.pubkey();
    assert!(env.send(&[ix], &[&mallory]).is_err());
    // The register is live during voting (BMET resumes the mint at finalize_snapshot).
    let issuer = env.issuer.insecure_clone();
    let ix = env.issue_ix(&b, &issuer.pubkey(), &by_units(&h, 10).pubkey(), 1);
    env.send(&[ix], &[&issuer])
        .expect("mint not paused during voting");
}
