//! Record date by transfer-hook gate (plan 15 D1', tasks 1509–1510): the program is the bond mint's transfer hook;
//! after `record_at` a position moves only once snapshotted, so every snapshot equals the balance at `record_at` while
//! the market keeps trading. Also: the legacy (pause) path made permissionless, and the order-independent hash.
mod common;

use anchor_lang::{
    prelude::{pubkey, Pubkey},
    solana_program::{
        instruction::{AccountMeta, Instruction},
        system_program,
    },
    InstructionData, Space, ToAccountMetas,
};
use anchor_spl::{token::spl_token, token_2022::spl_token_2022};
use common::*;
use qupon_bonds::{
    constants::{DVP_PROGRAM_ID, EXTRA_METAS_SEED, SNAP_HASH_DOMAIN, TRADE_SEED},
    error::QuponError,
    Checkpoint, CorporateAction, Entitlement, InitSeriesParams, Series,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const MEMO: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

fn metas_pda(b: &Bond) -> Pubkey {
    Pubkey::find_program_address(&[EXTRA_METAS_SEED, b.mint.as_ref()], &qupon_bonds::id()).0
}

fn bond_ata(owner: &Pubkey, b: &Bond) -> Pubkey {
    ata(owner, &b.mint, &spl_token_2022::ID)
}

fn cash_ata(owner: &Pubkey, b: &Bond) -> Pubkey {
    ata(owner, &b.cash, &b.cash_tp)
}

fn admission_pda(b: &Bond, swap: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(
        &[TRADE_SEED, b.series.as_ref(), swap.as_ref()],
        &qupon_bonds::id(),
    )
    .0
}

/// The accounts Token-2022 resolves from our `ExtraAccountMetaList` (it matches them by key).
fn hook_extras(b: &Bond, src_owner: &Pubkey, dst_owner: &Pubkey) -> Vec<AccountMeta> {
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    vec![
        ro(b.series),
        ro(checkpoint_pda(&b.series, src_owner)),
        ro(checkpoint_pda(&b.series, dst_owner)),
        ro(qupon_bonds::id()),
        ro(metas_pda(b)),
    ]
}

fn hooked_transfer(b: &Bond, from: &Pubkey, to: &Pubkey, amount: u64) -> Instruction {
    let mut ix = bond_transfer(b, from, to, amount);
    ix.accounts.extend(hook_extras(b, from, to));
    ix
}

/// Re-sign a crank instruction (authority = account 0) by `who`.
fn signed_by(mut ix: Instruction, who: &Keypair) -> Instruction {
    ix.accounts[0].pubkey = who.pubkey();
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

enum Pos {
    Holder(Pubkey),
    Escrow { swap: Pubkey, seller: Pubkey },
}

/// `snapshot_batch` on a hooked series over `positions`, signed by `who`.
fn positions_ix(b: &Bond, index: u32, positions: &[Pos], who: &Pubkey) -> Instruction {
    let action = action_pda(&b.series, index);
    let mut metas = qupon_bonds::accounts::SnapshotBatch {
        authority: *who,
        series: b.series,
        action,
        mint: b.mint,
        system_program: system_program::ID,
    }
    .to_account_metas(None);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let w = |k: Pubkey| AccountMeta::new(k, false);
    for p in positions {
        match p {
            Pos::Holder(o) => metas.extend([
                ro(investor_pda(&b.series, o)),
                ro(bond_ata(o, b)),
                w(entitlement_pda(&action, o)),
                w(checkpoint_pda(&b.series, o)),
            ]),
            Pos::Escrow { swap, seller } => metas.extend([
                ro(admission_pda(b, swap)),
                ro(bond_ata(swap, b)),
                w(entitlement_pda(&action, seller)),
                w(checkpoint_pda(&b.series, swap)),
                ro(investor_pda(&b.series, seller)),
            ]),
        }
    }
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::SnapshotBatch {}.data(),
        metas,
    )
}

fn holders_pos(owners: &[Pubkey]) -> Vec<Pos> {
    owners.iter().map(|o| Pos::Holder(*o)).collect()
}

/// Hooked series (params tweaked by `f`) with holders 10 / 25 / 65 (sorted by owner) and the DvP program loaded.
fn hooked_with(f: impl FnOnce(&mut InitSeriesParams)) -> (Env, Bond, Vec<Keypair>) {
    let mut env = Env::new();
    env.svm
        .add_program(DVP_PROGRAM_ID, include_bytes!("fixtures/dvp_swap.so"))
        .unwrap();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, series) = env.create_bond_mint(BondMintOpts {
        transfer_hook: true,
        ..Default::default()
    });
    let mut p = env.params();
    f(&mut p);
    let ix = env.init_series_ix(mint, cash, spl_token::ID, p);
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
    let holders = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    let s: Series = env.account(&b.series);
    assert_eq!((s.hook, s.ckpt_count), (1, 3));
    (env, b, holders)
}

fn hooked() -> (Env, Bond, Vec<Keypair>) {
    hooked_with(|_| {})
}

fn keys(h: &[Keypair]) -> Vec<Pubkey> {
    h.iter().map(|k| k.pubkey()).collect()
}

fn announce(env: &mut Env, b: &Bond, args: qupon_bonds::AnnounceArgs) -> i64 {
    let record_at = args.record_at;
    let ix = env.announce_ix(b, &env.registrar.pubkey(), args);
    env.send(&[ix], &[]).expect("announce");
    record_at
}

fn ents(env: &Env, b: &Bond, index: u32, owners: &[Pubkey]) -> Vec<u64> {
    let action = action_pda(&b.series, index);
    owners
        .iter()
        .map(|o| {
            env.account::<Entitlement>(&entitlement_pda(&action, o))
                .units
        })
        .collect()
}

fn leaf(action: &Pubkey, owner: &Pubkey, units: u64) -> [u8; 32] {
    use sha2::Digest;
    let mut h = sha2::Sha256::new();
    h.update(SNAP_HASH_DOMAIN);
    h.update(action.as_ref());
    h.update(owner.as_ref());
    h.update(units.to_le_bytes());
    h.finalize().into()
}

fn set_hash(action: &Pubkey, holdings: &[(Pubkey, u64)]) -> [u8; 32] {
    let mut acc = [0u8; 32];
    for (o, u) in holdings {
        for (a, l) in acc.iter_mut().zip(leaf(action, o, *u)) {
            *a ^= l;
        }
    }
    acc
}

fn fund_and_pay(env: &mut Env, b: &Bond, owners: &[Pubkey], who: &Keypair) {
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    let required = a.total_net + a.total_tax + a.total_principal;
    env.issuer_cash(b);
    let issuer = env.issuer.insecure_clone();
    env.fund_cash(b, &issuer.pubkey(), required);
    let ix = env.fund_ix(b, &issuer.pubkey(), 0, required);
    env.send(&[ix], &[&issuer]).expect("fund");
    let ix = signed_by(env.pay_ix(b, 0, owners), who);
    env.send(&[ix], &[who]).expect("anyone pays");
}

#[test]
fn intr_full_cycle_on_a_hooked_series_cranked_by_an_outsider() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let outsider = Keypair::new();
    env.svm.airdrop(&outsider.pubkey(), 10_000_000_000).unwrap();
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);

    let ix = positions_ix(&b, 0, &holders_pos(&owners), &outsider.pubkey());
    env.send(&[ix], &[&outsider]).expect("anyone snapshots");
    let ix = signed_by(env.finalize_snapshot_ix(&b, 0), &outsider);
    env.send(&[ix], &[&outsider])
        .expect("anyone finalizes: Σ == supply");
    assert_eq!(
        env.account::<Series>(&b.series).record_at,
        0,
        "gate off: ex-date trading"
    );
    // No snapshot needed any more: the record is final.
    let ix = hooked_transfer(&b, &owners[2], &owners[0], 5);
    env.send(&[ix], &[&h[2]]).expect("trades ex-date");

    fund_and_pay(&mut env, &b, &owners, &outsider);
    let mut paid: Vec<u64> = owners
        .iter()
        .map(|o| env.balance(&cash_ata(o, &b)))
        .collect();
    paid.sort();
    assert_eq!(
        paid,
        vec![50_000, 125_000, 325_000],
        "coupon per record-date holding"
    );
    let ix = signed_by(env.complete_ix(&b, 0), &outsider);
    env.send(&[ix], &[&outsider]).expect("anyone completes");
}

#[test]
fn transfer_after_record_needs_snapshot_and_entitlement_is_the_balance_at_record_at() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let (a, c) = (owners[0], owners[1]);
    let before: Vec<u64> = owners
        .iter()
        .map(|o| env.balance(&bond_ata(o, &b)))
        .collect();
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);

    assert_err(
        env.send(&[hooked_transfer(&b, &a, &c, 4)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
    // Sender only: the receiver's balance at record_at would change.
    let ix = positions_ix(&b, 0, &[Pos::Holder(a)], &env.registrar.pubkey());
    assert_err(
        env.send(&[ix, hooked_transfer(&b, &a, &c, 4)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
    // Snapshot both, then transfer — one transaction.
    let ix = positions_ix(
        &b,
        0,
        &[Pos::Holder(a), Pos::Holder(c)],
        &env.registrar.pubkey(),
    );
    env.send(&[ix, hooked_transfer(&b, &a, &c, 4)], &[&h[0]])
        .expect("snapshot-then-transfer");
    assert_eq!(ents(&env, &b, 0, &[a, c]), vec![before[0], before[1]]);
    // A not-yet-snapshotted holder can neither send nor receive.
    let z = owners[2];
    assert_err(
        env.send(&[hooked_transfer(&b, &a, &z, 1)], &[&h[0]]),
        QuponError::HolderNotSnapshotted,
    );
    // Re-sending a processed position is a no-op.
    let ix = positions_ix(&b, 0, &[Pos::Holder(a)], &env.registrar.pubkey());
    env.send(&[ix], &[]).expect("idempotent");
    assert_eq!(ents(&env, &b, 0, &[a]), vec![before[0]]);
}

#[test]
fn finalize_requires_every_position_and_set_hash_is_order_free() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let reg = env.registrar.pubkey();
    // Two of three positions: incomplete.
    let ix = positions_ix(
        &b,
        0,
        &[Pos::Holder(owners[2]), Pos::Holder(owners[0])],
        &reg,
    );
    env.send(&[ix], &[]).unwrap();
    assert_err(
        env.send(&[env.finalize_snapshot_ix(&b, 0)], &[]),
        QuponError::PositionsIncomplete,
    );
    let ix = positions_ix(&b, 0, &[Pos::Holder(owners[1])], &reg);
    env.send(&[ix], &[]).unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[])
        .expect("complete");
    let action = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&action);
    let holdings: Vec<(Pubkey, u64)> = owners
        .iter()
        .map(|o| {
            (
                *o,
                env.account::<Entitlement>(&entitlement_pda(&action, o))
                    .units,
            )
        })
        .collect();
    assert_eq!(a.hash_scheme, 1);
    assert_eq!(a.snapshot_hash, set_hash(&action, &holdings));
}

#[test]
fn a_holder_burning_after_their_snapshot_cannot_block_finalize() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let ix = positions_ix(&b, 0, &holders_pos(&owners), &env.registrar.pubkey());
    env.send(&[ix], &[]).unwrap();
    // Burns do not invoke the hook: Σ snapshotted now exceeds supply by 1.
    let burn = spl_token_2022::instruction::burn_checked(
        &spl_token_2022::ID,
        &bond_ata(&owners[0], &b),
        &b.mint,
        &owners[0],
        &[],
        1,
        0,
    )
    .unwrap();
    env.send(&[burn], &[&h[0]]).expect("self-burn");
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[])
        .expect("completeness is proven by checkpoints; Σ ≥ supply");
}

#[test]
fn minting_is_blocked_while_a_record_is_pending() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let issuer = env.issuer.insecure_clone();
    let ix = env.issue_ix(&b, &issuer.pubkey(), &owners[0], 1);
    assert_err(env.send(&[ix], &[&issuer]), QuponError::RecordPending);
    let ix = positions_ix(&b, 0, &holders_pos(&owners), &env.registrar.pubkey());
    env.send(&[ix], &[]).unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[]).unwrap();
    let ix = env.issue_ix(&b, &issuer.pubkey(), &owners[0], 1);
    env.send(&[ix], &[&issuer]).expect("after finalize");
}

#[test]
fn an_investor_registered_after_record_at_can_receive_at_once() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let late = Keypair::new();
    env.register(&b, &late.pubkey())
        .expect("register after record_at");
    let c: Checkpoint = env.account(&checkpoint_pda(&b.series, &late.pubkey()));
    assert_eq!(c.last_seq, 1);
    let ix = positions_ix(&b, 0, &[Pos::Holder(owners[0])], &env.registrar.pubkey());
    env.send(
        &[ix, hooked_transfer(&b, &owners[0], &late.pubkey(), 2)],
        &[&h[0]],
    )
    .expect("snapshotted sender → late investor");
    // The late checkpoint completes the count without a snapshot of its own.
    let ix = positions_ix(&b, 0, &holders_pos(&owners[1..]), &env.registrar.pubkey());
    env.send(&[ix], &[]).unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[])
        .expect("complete with a late position");
}

#[test]
fn a_redemption_record_locks_the_register() {
    let (mut env, b, h) = hooked_with(|p| p.maturity_date = NEXT_COUPON);
    let owners = keys(&h);
    let now = env.now();
    let args = qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    };
    let record_at = announce(&mut env, &b, args);
    env.set_clock(record_at + 1);
    let ix = positions_ix(&b, 0, &holders_pos(&owners), &env.registrar.pubkey());
    env.send(&[ix], &[]).unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[]).unwrap();
    assert_err(
        env.send(&[hooked_transfer(&b, &owners[0], &owners[1], 1)], &[&h[0]]),
        QuponError::RecordLocked,
    );
}

#[test]
fn direct_execute_and_transfers_without_extras_are_rejected() {
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
            source_checkpoint: checkpoint_pda(&b.series, &src),
            destination_checkpoint: checkpoint_pda(&b.series, &dst),
        }
        .to_account_metas(None),
    );
    assert_err(env.send(&[ix], &[]), QuponError::NotTransferring);
    let ix = bond_transfer(&b, &src, &dst, 1);
    assert!(
        env.send(&[ix], &[&h[0]]).is_err(),
        "Token-2022 refuses a hooked transfer without extras"
    );
    let meta = env
        .send(&[hooked_transfer(&b, &src, &dst, 1)], &[&h[0]])
        .expect("with extras");
    println!("CU hooked transfer = {}", meta.compute_units_consumed);
}

struct Trade {
    swap: Pubkey,
    escrow: Pubkey,
    cash_escrow: Pubkey,
}

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
            admission: admission_pda(b, &t.swap),
            escrow_checkpoint: checkpoint_pda(&b.series, &t.swap),
            bond_token_program: spl_token_2022::ID,
            system_program: system_program::ID,
            open_action: None,
        }
        .to_account_metas(None),
    )
}

fn release_ix(env: &Env, b: &Bond, t: &Trade, seller: &Pubkey, force: bool) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::ReleaseTrade { force }.data(),
        qupon_bonds::accounts::ReleaseTrade {
            authority: env.registrar.pubkey(),
            series: b.series,
            mint: b.mint,
            admission: admission_pda(b, &t.swap),
            escrow: t.escrow,
            seller: investor_pda(&b.series, seller),
            seller_bond_ata: bond_ata(seller, b),
            escrow_checkpoint: checkpoint_pda(&b.series, &t.swap),
            bond_token_program: spl_token_2022::ID,
        }
        .to_account_metas(None),
    )
}

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
fn an_open_trade_across_the_record_date_is_the_sellers_position() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let (seller, buyer) = (h[0].insecure_clone(), h[1].insecure_clone());
    let (s, u) = (seller.pubkey(), buyer.pubkey());
    let seller_units = env.balance(&bond_ata(&s, &b));
    let (units, cash) = (5u64, 500_000u64);
    env.fund_cash(&b, &u, cash);
    let t = create_dvp(&mut env, &b, &s, &u, units, cash);
    let ix = admit_ix(&env, &b, &t, &s, &u);
    env.send(&[ix], &[])
        .expect("admit creates the escrow checkpoint");
    assert_eq!(env.account::<Series>(&b.series).ckpt_count, 4);
    fund(&mut env, &b, &t, &seller, &buyer, units, cash);

    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    // Releasing is refused while the record is pending; settlement waits for the snapshot.
    assert_err(
        env.send(&[release_ix(&env, &b, &t, &s, true)], &[]),
        QuponError::RecordPending,
    );
    assert_err(
        env.send(&[settle_ix(&env, &b, &t, &s, &u)], &[]),
        QuponError::HolderNotSnapshotted,
    );
    let reg = env.registrar.pubkey();
    let snap = positions_ix(
        &b,
        0,
        &[
            Pos::Holder(s),
            Pos::Escrow {
                swap: t.swap,
                seller: s,
            },
            Pos::Holder(u),
        ],
        &reg,
    );
    let meta = env
        .send(&[snap, settle_ix(&env, &b, &t, &s, &u)], &[])
        .expect("snapshot seller + escrow + buyer, then SettleDvp through the hook");
    println!(
        "CU 3 positions + SettleDvp = {}",
        meta.compute_units_consumed
    );
    assert_eq!(
        ents(&env, &b, 0, &[s]),
        vec![seller_units],
        "own units + escrowed units"
    );
    let ix = positions_ix(&b, 0, &[Pos::Holder(owners[2])], &reg);
    env.send(&[ix], &[]).unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[])
        .expect("Σ == supply with the escrow");
    let ix = release_ix(&env, &b, &t, &s, false);
    env.send(&[ix], &[])
        .expect("release after the record is final");
    let s_after: Series = env.account(&b.series);
    assert_eq!((s_after.ckpt_count, s_after.open_trades), (3, 0));
}

#[test]
fn a_forced_release_on_a_hooked_series_burns_and_mints() {
    let (mut env, b, h) = hooked();
    let (seller, buyer) = (h[0].insecure_clone(), h[1].insecure_clone());
    let (s, u) = (seller.pubkey(), buyer.pubkey());
    let before = env.balance(&bond_ata(&s, &b));
    env.fund_cash(&b, &u, 500_000);
    let t = create_dvp(&mut env, &b, &s, &u, 5, 500_000);
    let ix = admit_ix(&env, &b, &t, &s, &u);
    env.send(&[ix], &[]).unwrap();
    fund(&mut env, &b, &t, &seller, &buyer, 5, 500_000);
    let ix = release_ix(&env, &b, &t, &s, true);
    env.send(&[ix], &[])
        .expect("forced release without re-entering the hook");
    assert_eq!(env.balance(&bond_ata(&s, &b)), before);
}

#[test]
fn legacy_series_keep_the_pause_path_but_anyone_cranks() {
    let mut env = Env::new();
    let b = env.setup_bond();
    let h: Vec<Keypair> = env
        .holders(&b, &[10, 25, 65])
        .into_iter()
        .map(|(k, _)| k)
        .collect();
    let owners = keys(&h);
    let outsider = Keypair::new();
    env.svm.airdrop(&outsider.pubkey(), 10_000_000_000).unwrap();
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at);
    for ix in [
        env.strike_ix(&b, &outsider.pubkey(), 0),
        signed_by(env.snapshot_ix(&b, 0, &owners), &outsider),
        signed_by(env.finalize_snapshot_ix(&b, 0), &outsider),
    ] {
        env.send(&[ix], &[&outsider]).expect("anyone");
    }
    // Coupons trade ex-date right after finalize on the legacy path too.
    env.send(&[bond_transfer(&b, &owners[2], &owners[0], 1)], &[&h[2]])
        .expect("ex-date transfer on the resumed mint");
    let action = action_pda(&b.series, 0);
    let a: CorporateAction = env.account(&action);
    let holdings: Vec<(Pubkey, u64)> = owners
        .iter()
        .map(|o| {
            (
                *o,
                env.account::<Entitlement>(&entitlement_pda(&action, o))
                    .units,
            )
        })
        .collect();
    assert_eq!(a.snapshot_hash, set_hash(&action, &holdings));
    fund_and_pay(&mut env, &b, &owners, &outsider);
    let ix = signed_by(env.complete_ix(&b, 0), &outsider);
    env.send(&[ix], &[&outsider]).expect("anyone completes");
}

#[test]
fn account_sizes_are_frozen() {
    assert_eq!(8 + Series::INIT_SPACE, 389);
    assert_eq!(8 + CorporateAction::INIT_SPACE, 435);
    assert_eq!(8 + Checkpoint::INIT_SPACE, 77);
}

// ---- Regressions from the 1510 security review (each was a permanent liveness failure before the fix) ----

fn redm(now: i64) -> qupon_bonds::AnnounceArgs {
    qupon_bonds::AnnounceArgs {
        kind: 1,
        corp_id: corp_id("QPNb1-REDM-0001"),
        ..intr_args(now)
    }
}

/// Non-ATA Token-2022 account for the bond mint owned by `owner` (frozen by DefaultAccountState).
fn non_ata(env: &mut Env, b: &Bond, owner: &Keypair) -> Pubkey {
    use spl_token_2022::extension::{BaseStateWithExtensions, ExtensionType, StateWithExtensions};
    let acct = Keypair::new();
    let m = env.svm.get_account(&b.mint).unwrap();
    let st = StateWithExtensions::<spl_token_2022::state::Mint>::unpack(&m.data).unwrap();
    let types = st.get_extension_types().unwrap();
    let req = ExtensionType::get_required_init_account_extensions(&types);
    let len =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Account>(&req).unwrap();
    let lamports = env.svm.minimum_balance_for_rent_exemption(len);
    env.svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    let create = anchor_lang::solana_program::system_instruction::create_account(
        &owner.pubkey(),
        &acct.pubkey(),
        lamports,
        len as u64,
        &spl_token_2022::ID,
    );
    let init = spl_token_2022::instruction::initialize_account3(
        &spl_token_2022::ID,
        &acct.pubkey(),
        &b.mint,
        &owner.pubkey(),
    )
    .unwrap();
    env.send(&[create, init], &[owner, &acct])
        .expect("non-ATA account");
    acct.pubkey()
}

#[test]
fn a_hooked_redemption_cannot_coexist_with_open_trades() {
    let (mut env, b, h) = hooked_with(|p| p.maturity_date = NEXT_COUPON);
    let (s, u) = (h[0].pubkey(), h[1].pubkey());
    let t = create_dvp(&mut env, &b, &s, &u, 5, 500_000);
    let ix = admit_ix(&env, &b, &t, &s, &u);
    env.send(&[ix], &[]).unwrap();
    let now = env.now();
    let ix = env.announce_ix(&b, &env.registrar.pubkey(), redm(now));
    assert_err(env.send(&[ix], &[]), QuponError::TradesInFlight);
    // Released first, the redemption can be announced; afterwards no trade can be admitted.
    let ix = release_ix(&env, &b, &t, &s, false);
    env.send(&[ix], &[]).expect("release the unfunded trade");
    announce(&mut env, &b, redm(now));
    let t2 = create_dvp(&mut env, &b, &u, &s, 1, 100_000);
    let ix = admit_ix(&env, &b, &t2, &u, &s);
    assert_err(env.send(&[ix], &[]), QuponError::RecordLocked);
}

#[test]
fn a_closed_empty_ata_is_a_zero_position() {
    let (mut env, b, h) = hooked();
    let owners = keys(&h);
    let z = Keypair::new();
    env.register(&b, &z.pubkey())
        .expect("register an empty investor");
    env.svm.airdrop(&z.pubkey(), 1_000_000_000).unwrap();
    let close = spl_token_2022::instruction::close_account(
        &spl_token_2022::ID,
        &bond_ata(&z.pubkey(), &b),
        &z.pubkey(),
        &z.pubkey(),
        &[],
    )
    .unwrap();
    env.send(&[close], &[&z])
        .expect("investor closes the empty bond ATA");
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let reg = env.registrar.pubkey();
    let mut pos = holders_pos(&owners);
    pos.push(Pos::Holder(z.pubkey()));
    env.send(&[positions_ix(&b, 0, &pos, &reg)], &[])
        .expect("closed ATA = 0 units");
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[])
        .expect("complete");
}

#[test]
fn a_permissionless_retire_only_touches_the_canonical_ata() {
    let mut env = Env::new();
    let b = env.setup_bond_with(|p| p.maturity_date = NEXT_COUPON);
    let holders = env.holders(&b, &[10, 25]);
    let owners: Vec<Pubkey> = holders.iter().map(|(k, _)| k.pubkey()).collect();
    let h0 = holders[0].0.insecure_clone();
    let side = non_ata(&mut env, &b, &h0);
    let now = env.now();
    env.settle_action(&b, redm(now), &owners);
    let mallory = Keypair::new();
    env.svm.airdrop(&mallory.pubkey(), 1_000_000_000).unwrap();
    let mut ix = env.retire_ix(&b, 0, &owners[..1]);
    ix.accounts[0].pubkey = mallory.pubkey();
    ix.accounts[6].pubkey = side;
    assert_err(
        env.send(&[ix], &[&mallory]),
        QuponError::AccountOwnerMismatch,
    );
    assert!(env.is_frozen(&side), "the side account stays frozen");
}

#[test]
fn registering_before_init_hook_is_refused() {
    let mut env = Env::new();
    let cash = env.create_cash_mint(spl_token::ID);
    let (mint, series) = env.create_bond_mint(BondMintOpts {
        transfer_hook: true,
        ..Default::default()
    });
    let ix = env.init_series_ix(mint, cash, spl_token::ID, env.params());
    env.send(&[ix], &[]).unwrap();
    let b = Bond {
        mint,
        series,
        cash,
        cash_tp: spl_token::ID,
    };
    let early = Keypair::new();
    assert_err(env.register(&b, &early.pubkey()), QuponError::HookNotArmed);
    env.send(&[init_hook_ix(&env, &b)], &[])
        .expect("arm the gate");
    env.register(&b, &early.pubkey())
        .expect("now registration works");
}

#[test]
fn an_empty_snapshot_batch_does_not_strike_the_record() {
    let (mut env, b, _h) = hooked();
    let now = env.now();
    let record_at = announce(&mut env, &b, intr_args(now));
    env.set_clock(record_at + 1);
    let ix = positions_ix(&b, 0, &[], &env.registrar.pubkey());
    env.send(&[ix], &[]).expect("no-op");
    let a: CorporateAction = env.account(&action_pda(&b.series, 0));
    assert_eq!(a.status, qupon_bonds::ActionStatus::Announced as u8);
    env.send(&[env.cancel_ix(&b, 0)], &[])
        .expect("the registrar can still cancel");
    assert_eq!(env.account::<Series>(&b.series).record_at, 0);
}

#[test]
fn a_hooked_redemption_pays_burns_and_closes_without_pausing() {
    let (mut env, b, h) = hooked_with(|p| p.maturity_date = NEXT_COUPON);
    let owners = keys(&h);
    let now = env.now();
    let record_at = announce(&mut env, &b, redm(now));
    env.set_clock(record_at + 1);
    let reg = env.registrar.pubkey();
    env.send(&[positions_ix(&b, 0, &holders_pos(&owners), &reg)], &[])
        .unwrap();
    env.send(&[env.finalize_snapshot_ix(&b, 0)], &[]).unwrap();
    let outsider = Keypair::new();
    env.svm.airdrop(&outsider.pubkey(), 10_000_000_000).unwrap();
    fund_and_pay(&mut env, &b, &owners, &outsider);
    for o in &owners {
        assert_eq!(
            env.balance(&bond_ata(o, &b)),
            0,
            "paid and burned in one instruction"
        );
    }
    let ix = signed_by(env.complete_ix(&b, 0), &outsider);
    env.send(&[ix], &[&outsider]).expect("complete");
    env.send(&[env.close_series_ix(&b, 0)], &[])
        .expect("close: supply already 0");
}
