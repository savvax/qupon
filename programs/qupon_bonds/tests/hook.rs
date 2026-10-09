//! Spike 1509 (plan 15 D1'): the record date enforced by this program acting as the bond mint's transfer hook,
//! with the Solana DvP program settling through the hook. Go/no-go evidence for the hook gate.
mod common;

use anchor_lang::{
    prelude::{pubkey, Pubkey},
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_program,
    },
    InstructionData, ToAccountMetas,
};
use anchor_spl::{token::spl_token, token_2022::spl_token_2022};
use common::*;
use qupon_bonds::{
    constants::{CHECKPOINT_SEED, DVP_PROGRAM_ID, EXTRA_METAS_SEED, TRADE_SEED},
    error::QuponError,
    Series,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const MEMO: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

fn ckpt(b: &Bond, owner: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[CHECKPOINT_SEED, b.series.as_ref(), owner.as_ref()],
        &qupon_bonds::id(),
    )
    .0
}

fn metas_pda(b: &Bond) -> Pubkey {
    Pubkey::find_program_address(&[EXTRA_METAS_SEED, b.mint.as_ref()], &qupon_bonds::id()).0
}

fn bond_ata(owner: &Pubkey, b: &Bond) -> Pubkey {
    ata(owner, &b.mint, &spl_token_2022::ID)
}

fn cash_ata(owner: &Pubkey, b: &Bond) -> Pubkey {
    ata(owner, &b.cash, &b.cash_tp)
}

/// The accounts Token-2022 needs to resolve our `ExtraAccountMetaList` (order is irrelevant: it matches by key).
fn hook_extras(b: &Bond, src_owner: &Pubkey, dst_owner: &Pubkey) -> Vec<AccountMeta> {
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    vec![
        ro(b.series),
        ro(ckpt(b, src_owner)),
        ro(ckpt(b, dst_owner)),
        ro(qupon_bonds::id()),
        ro(metas_pda(b)),
    ]
}

fn hooked_transfer(b: &Bond, from: &Pubkey, to: &Pubkey, amount: u64) -> Instruction {
    let mut ix = bond_transfer(b, from, to, amount);
    ix.accounts.extend(hook_extras(b, from, to));
    ix
}

fn init_hook_ix(env: &Env, b: &Bond) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::InitHook {}.data(),
        qupon_bonds::accounts::InitHook {
            registrar: env.registrar.pubkey(),
            series: b.series,
            mint: b.mint,
            extra_account_meta_list: metas_pda(b),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn init_ckpt_ix(env: &Env, b: &Bond, owner: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::InitCheckpoint { owner: *owner }.data(),
        qupon_bonds::accounts::InitCheckpoint {
            payer: env.registrar.pubkey(),
            series: b.series,
            checkpoint: ckpt(b, owner),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn mark_ix(b: &Bond, owner: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::MarkSnapshotted {}.data(),
        qupon_bonds::accounts::MarkSnapshotted {
            series: b.series,
            checkpoint: ckpt(b, owner),
        }
        .to_account_metas(None),
    )
}

/// Hooked series with holders 10 / 25 / 65 (sorted by owner), each with a checkpoint, and the DvP program loaded.
fn hooked() -> (Env, Bond, Vec<Keypair>) {
    let mut env = Env::new();
    env.svm
        .add_program(DVP_PROGRAM_ID, include_bytes!("fixtures/dvp_swap.so"))
        .unwrap();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, series) = env.create_bond_mint(BondMintOpts {
        transfer_hook: true,
        ..Default::default()
    });
    let ix = env.init_series_ix(mint, cash, spl_token::ID, env.params());
    env.send(&[ix], &[])
        .expect("init_series accepts the hooked mint");
    let b = Bond {
        mint,
        series,
        cash,
        cash_tp: spl_token::ID,
    };
    let ix = init_hook_ix(&env, &b);
    env.send(&[ix], &[]).expect("init_hook");
    assert_eq!(env.account::<Series>(&b.series).hook, 1);
    let holders: Vec<Keypair> = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    for h in &holders {
        let ix = init_ckpt_ix(&env, &b, &h.pubkey());
        env.send(&[ix], &[]).expect("checkpoint");
    }
    (env, b, holders)
}

fn announce_intr(env: &mut Env, b: &Bond) -> i64 {
    let now = env.now();
    let args = intr_args(now);
    let record_at = args.record_at;
    let ix = env.announce_ix(b, &env.registrar.pubkey(), args);
    env.send(&[ix], &[]).expect("announce");
    let s: Series = env.account(&b.series);
    assert_eq!(
        (s.record_at, s.record_seq, s.record_kind),
        (record_at, 1, 0)
    );
    record_at
}

#[test]
fn hooked_transfer_passes_before_record_and_reports_cu() {
    let (mut env, b, h) = hooked();
    let before = env.balance(&bond_ata(&h[1].pubkey(), &b));
    let ix = hooked_transfer(&b, &h[0].pubkey(), &h[1].pubkey(), 3);
    let meta = env.send(&[ix], &[&h[0]]).expect("hooked transfer");
    assert_eq!(env.balance(&bond_ata(&h[1].pubkey(), &b)), before + 3);
    println!(
        "SPIKE CU hooked transfer_checked = {}",
        meta.compute_units_consumed
    );
}

#[test]
fn transfer_without_hook_accounts_fails() {
    let (mut env, b, h) = hooked();
    let ix = bond_transfer(&b, &h[0].pubkey(), &h[1].pubkey(), 1);
    assert!(
        env.send(&[ix], &[&h[0]]).is_err(),
        "Token-2022 must refuse a hooked transfer without the extras"
    );
}

#[test]
fn direct_execute_is_rejected() {
    let (mut env, b, h) = hooked();
    let (src, dst) = (h[0].pubkey(), h[1].pubkey());
    let ix = Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::Execute { amount: 1 }.data(),
        qupon_bonds::accounts::Execute {
            source: bond_ata(&src, &b),
            mint: b.mint,
            destination: bond_ata(&dst, &b),
            authority: src,
            extra_account_meta_list: metas_pda(&b),
            series: b.series,
            source_checkpoint: ckpt(&b, &src),
            destination_checkpoint: ckpt(&b, &dst),
        }
        .to_account_metas(None),
    );
    assert_err(env.send(&[ix], &[]), QuponError::NotTransferring);
}

#[test]
fn after_record_at_both_sides_must_be_snapshotted_and_same_tx_works() {
    let (mut env, b, h) = hooked();
    let (a, c) = (h[0].pubkey(), h[1].pubkey());
    let record_at = announce_intr(&mut env, &b);

    // Before record_at nothing is gated and nobody can be marked early.
    env.send(&[hooked_transfer(&b, &a, &c, 1)], &[&h[0]])
        .expect("before record_at");
    assert_err(env.send(&[mark_ix(&b, &a)], &[]), QuponError::TooEarly);

    env.set_clock(record_at + 1);
    assert_err(
        env.send(&[hooked_transfer(&b, &a, &c, 1)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
    // Only the sender snapshotted: the receiver's balance at record_at would change, so it still fails.
    assert_err(
        env.send(&[mark_ix(&b, &a), hooked_transfer(&b, &a, &c, 1)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
    // Snapshot both, then transfer — one transaction, no halt for the trader.
    let meta = env
        .send(
            &[
                mark_ix(&b, &a),
                mark_ix(&b, &c),
                hooked_transfer(&b, &a, &c, 1),
            ],
            &[&h[0]],
        )
        .expect("snapshot-then-transfer");
    println!(
        "SPIKE CU 2 marks + hooked transfer = {}",
        meta.compute_units_consumed
    );
    // A third holder who was never snapshotted cannot receive.
    let z = h[2].pubkey();
    assert_err(
        env.send(&[hooked_transfer(&b, &a, &z, 1)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
}

struct Trade {
    swap: Pubkey,
    escrow: Pubkey,
    cash_escrow: Pubkey,
}

/// `CreateDvp`: `units` bonds against `cash`, the registrar settles and pays rent.
fn create_dvp(
    env: &mut Env,
    b: &Bond,
    seller: &Pubkey,
    buyer: &Pubkey,
    units: u64,
    cash: u64,
) -> Trade {
    let authority = env.registrar.pubkey();
    let nonce = 7u64;
    let swap = Pubkey::find_program_address(
        &[
            b"dvp",
            authority.as_ref(),
            seller.as_ref(),
            buyer.as_ref(),
            b.mint.as_ref(),
            b.cash.as_ref(),
            &nonce.to_le_bytes(),
        ],
        &DVP_PROGRAM_ID,
    )
    .0;
    let tombstone = Pubkey::find_program_address(&[b"nonce", swap.as_ref()], &DVP_PROGRAM_ID).0;
    let t = Trade {
        swap,
        escrow: bond_ata(&swap, b),
        cash_escrow: cash_ata(&swap, b),
    };
    let mut data = vec![0u8];
    data.extend(units.to_le_bytes());
    data.extend(cash.to_le_bytes());
    data.extend((env.now() + 30 * 86_400).to_le_bytes());
    data.extend(nonce.to_le_bytes());
    data.extend([0u8; 4]);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let ix = Instruction::new_with_bytes(
        DVP_PROGRAM_ID,
        &data,
        vec![
            AccountMeta::new(authority, true),
            AccountMeta::new(swap, false),
            AccountMeta::new(tombstone, false),
            ro(authority),
            ro(*seller),
            ro(*buyer),
            ro(b.mint),
            ro(b.cash),
            AccountMeta::new(t.escrow, false),
            AccountMeta::new(t.cash_escrow, false),
            ro(system_program::ID),
            ro(spl_token_2022::ID),
            ro(b.cash_tp),
            ro(anchor_spl::associated_token::ID),
        ],
    );
    env.send(&[ix], &[]).expect("CreateDvp");
    t
}

fn admit_ix(env: &Env, b: &Bond, t: &Trade, seller: &Pubkey, buyer: &Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::AdmitTrade {}.data(),
        qupon_bonds::accounts::AdmitTrade {
            authority: env.registrar.pubkey(),
            series: b.series,
            mint: b.mint,
            swap_dvp: t.swap,
            escrow: t.escrow,
            seller: investor_pda(&b.series, seller),
            buyer: investor_pda(&b.series, buyer),
            admission: Pubkey::find_program_address(
                &[TRADE_SEED, b.series.as_ref(), t.swap.as_ref()],
                &qupon_bonds::id(),
            )
            .0,
            bond_token_program: spl_token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

/// `SettleDvp` with the bond leg's hook extras (`leg_a_extras_count`), signed by the settlement authority.
fn settle_ix(env: &Env, b: &Bond, t: &Trade, seller: &Pubkey, buyer: &Pubkey) -> Instruction {
    let w = |k: Pubkey| AccountMeta::new(k, false);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let mut metas = vec![
        AccountMeta::new(env.registrar.pubkey(), true),
        w(t.swap),
        ro(b.mint),
        ro(b.cash),
        w(t.escrow),
        w(t.cash_escrow),
        w(cash_ata(seller, b)),
        w(bond_ata(buyer, b)),
        w(bond_ata(seller, b)),
        w(cash_ata(buyer, b)),
        ro(spl_token_2022::ID),
        ro(b.cash_tp),
        ro(MEMO),
    ];
    let extras = hook_extras(b, &t.swap, buyer);
    let n = extras.len() as u8;
    metas.extend(extras);
    Instruction::new_with_bytes(DVP_PROGRAM_ID, &[2, n], metas)
}

/// Seller and buyer fund their legs with plain transfers (the bond leg through the hook).
fn fund(
    env: &mut Env,
    b: &Bond,
    t: &Trade,
    seller: &Keypair,
    buyer: &Keypair,
    units: u64,
    cash: u64,
) {
    let asset = hooked_transfer(b, &seller.pubkey(), &t.swap, units);
    let money = spl_token::instruction::transfer(
        &spl_token::ID,
        &cash_ata(&buyer.pubkey(), b),
        &t.cash_escrow,
        &buyer.pubkey(),
        &[],
        cash,
    )
    .unwrap();
    env.send(&[asset, money], &[seller, buyer])
        .expect("fund both legs");
}

#[test]
fn dvp_settles_through_the_hook_and_waits_for_the_snapshot_after_record_at() {
    let (mut env, b, h) = hooked();
    let (seller, buyer) = (h[0].insecure_clone(), h[1].insecure_clone());
    let (s, u) = (seller.pubkey(), buyer.pubkey());
    let (units, cash) = (5u64, 500_000u64);
    env.fund_cash(&b, &u, cash);
    let t = create_dvp(&mut env, &b, &s, &u, units, cash);
    // The escrow owner (the SwapDvp PDA) gets a checkpoint when the trade is admitted (here: by hand).
    let ixs = [
        admit_ix(&env, &b, &t, &s, &u),
        init_ckpt_ix(&env, &b, &t.swap),
    ];
    env.send(&ixs, &[]).expect("admit + escrow checkpoint");
    fund(&mut env, &b, &t, &seller, &buyer, units, cash);

    // Record date passes while the trade is open: settlement waits for the escrow's and the buyer's snapshot.
    let record_at = announce_intr(&mut env, &b);
    env.set_clock(record_at + 1);
    let buyer_before = env.balance(&bond_ata(&u, &b));
    assert_err(
        env.send(&[settle_ix(&env, &b, &t, &s, &u)], &[]),
        QuponError::HolderNotSnapshotted,
    );
    let meta = env
        .send(
            &[
                mark_ix(&b, &t.swap),
                mark_ix(&b, &u),
                settle_ix(&env, &b, &t, &s, &u),
            ],
            &[],
        )
        .expect("snapshot + SettleDvp through the hook");
    assert_eq!(env.balance(&bond_ata(&u, &b)), buyer_before + units);
    println!(
        "SPIKE CU 2 marks + SettleDvp = {}",
        meta.compute_units_consumed
    );
}

#[test]
fn hook_fields_fit_in_reserved_bytes() {
    use anchor_lang::Space;
    assert_eq!(
        8 + Series::INIT_SPACE,
        389,
        "Series size is frozen (plan 15 D8)"
    );
    assert_eq!(8 + qupon_bonds::Checkpoint::INIT_SPACE, 77);
}
