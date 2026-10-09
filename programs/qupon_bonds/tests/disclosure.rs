//! Disclosure anchoring (plan 15 D9, task 1515): the registrar anchors the sha256 of the action's seev.031 once.
mod common;

use anchor_lang::{
    prelude::Pubkey, solana_program::instruction::Instruction, InstructionData, ToAccountMetas,
};
use common::*;
use qupon_bonds::{error::QuponError, events::DisclosureAttached, CorporateAction};
use solana_signer::Signer;

fn attach_ix(b: &Bond, signer: &Pubkey, hash: [u8; 32]) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::AttachDisclosure { hash }.data(),
        qupon_bonds::accounts::AttachDisclosure {
            registrar: *signer,
            series: b.series,
            action: action_pda(&b.series, 0),
        }
        .to_account_metas(None),
    )
}

#[test]
fn the_registrar_anchors_the_disclosure_once() {
    let mut env = Env::new();
    let b = env.setup_bond();
    env.holders(&b, &[10]);
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), intr_args(now));
    env.send(&[ix], &[]).unwrap();
    let reg = env.registrar.pubkey();
    // Only the registrar, never a zero hash.
    let issuer = env.issuer.insecure_clone();
    assert_err(
        env.send(&[attach_ix(&b, &issuer.pubkey(), [5; 32])], &[&issuer]),
        QuponError::Unauthorized,
    );
    assert_err(
        env.send(&[attach_ix(&b, &reg, [0; 32])], &[]),
        QuponError::InvalidParams,
    );
    let meta = env
        .send(&[attach_ix(&b, &reg, [5; 32])], &[])
        .expect("attach");
    assert_eq!(events_of::<DisclosureAttached>(&meta.logs)[0].hash, [5; 32]);
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(a.disclosure_hash, [5; 32]);
    assert_err(
        env.send(&[attach_ix(&b, &reg, [6; 32])], &[]),
        QuponError::AlreadyAttached,
    );
}
