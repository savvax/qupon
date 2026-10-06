//! Secondary trades settled by the Solana DvP program (docs/03-domain.md §4a): escrow admission, settlement,
//! release and the record-date guard. `fixtures/dvp_swap.so` is the devnet build (`make fixtures`).
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
    constants::{DVP_PROGRAM_ID, TRADE_SEED},
    error::QuponError,
    Series, TradeAdmission,
};
use solana_keypair::Keypair;
use solana_signer::Signer;

const MEMO: Pubkey = pubkey!("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const UNITS: u64 = 10;
/// 10 bonds at par (1,000.00 KZT each) in tiyn.
const CASH: u64 = 1_000_000;

struct Trade {
    swap: Pubkey,
    escrow: Pubkey,
    cash_escrow: Pubkey,
    seller: Keypair,
    buyer: Keypair,
}

/// A series with a 10-unit seller and a 25-unit buyer who holds the cash, and the DvP program loaded.
fn market() -> (Env, Bond, Keypair, Keypair) {
    let mut env = Env::new();
    env.svm
        .add_program(DVP_PROGRAM_ID, include_bytes!("fixtures/dvp_swap.so"))
        .unwrap();
    let b = env.setup_bond();
    let mut holders = env.holders(&b, &[UNITS, 25]);
    let at = holders.iter().position(|(_, u)| *u == UNITS).unwrap();
    let seller = holders.remove(at).0;
    let buyer = holders.remove(0).0;
    env.fund_cash(&b, &buyer.pubkey(), CASH);
    (env, b, seller, buyer)
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

/// Anyone can (re)create a bond ATA; DefaultAccountState makes it frozen.
fn create_bond_ata_ix(env: &Env, b: &Bond, owner: &Pubkey) -> Instruction {
    anchor_spl::associated_token::spl_associated_token_account::instruction::create_associated_token_account_idempotent(
        &env.registrar.pubkey(),
        owner,
        &b.mint,
        &spl_token_2022::ID,
    )
}

fn gone(env: &Env, key: &Pubkey) -> bool {
    env.svm.get_account(key).is_none_or(|a| a.lamports == 0)
}

fn open_trades(env: &Env, b: &Bond) -> u32 {
    env.account::<Series>(&b.series).open_trades
}

fn create_dvp(
    env: &mut Env,
    b: &Bond,
    authority: &Pubkey,
    seller: &Keypair,
    buyer: &Keypair,
    nonce: u64,
) -> Trade {
    create_dvp_to(env, b, authority, seller, buyer, nonce, None)
}

/// `CreateDvp` (discriminator 0): 10 bonds against the cash, `authority` settles, the registrar pays the rent;
/// `deliver_to` redirects the bond leg away from the buyer.
fn create_dvp_to(
    env: &mut Env,
    b: &Bond,
    authority: &Pubkey,
    seller: &Keypair,
    buyer: &Keypair,
    nonce: u64,
    deliver_to: Option<Pubkey>,
) -> Trade {
    let (s, u) = (seller.pubkey(), buyer.pubkey());
    let swap = Pubkey::find_program_address(
        &[
            b"dvp",
            authority.as_ref(),
            s.as_ref(),
            u.as_ref(),
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
        seller: seller.insecure_clone(),
        buyer: buyer.insecure_clone(),
    };
    // amount_a, amount_b, expiry, nonce, then four options: reference, user_a and user_b destination, earliest.
    let mut data = vec![0u8];
    data.extend(UNITS.to_le_bytes());
    data.extend(CASH.to_le_bytes());
    data.extend((env.now() + 3600).to_le_bytes());
    data.extend(nonce.to_le_bytes());
    data.extend([0u8; 2]);
    match deliver_to {
        Some(wallet) => {
            data.push(1);
            data.extend(wallet.to_bytes());
        }
        None => data.push(0),
    }
    data.push(0);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let ix = Instruction::new_with_bytes(
        DVP_PROGRAM_ID,
        &data,
        vec![
            AccountMeta::new(env.registrar.pubkey(), true),
            AccountMeta::new(swap, false),
            AccountMeta::new(tombstone, false),
            ro(*authority),
            ro(s),
            ro(u),
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

/// `SettleDvp` (2) or `CancelDvp` (3) signed by the registrar as settlement authority, no transfer-hook extras.
fn close_dvp_ix(env: &Env, b: &Bond, t: &Trade, settle: bool) -> Instruction {
    let (s, u) = (t.seller.pubkey(), t.buyer.pubkey());
    let w = |k: Pubkey| AccountMeta::new(k, false);
    let ro = |k: Pubkey| AccountMeta::new_readonly(k, false);
    let mut metas = vec![
        AccountMeta::new(env.registrar.pubkey(), true),
        w(t.swap),
        ro(b.mint),
        ro(b.cash),
        w(t.escrow),
        w(t.cash_escrow),
    ];
    if settle {
        metas.extend([w(cash_ata(&s, b)), w(bond_ata(&u, b))]);
    }
    metas.extend([
        w(bond_ata(&s, b)),
        w(cash_ata(&u, b)),
        ro(spl_token_2022::ID),
        ro(b.cash_tp),
        ro(MEMO),
    ]);
    Instruction::new_with_bytes(DVP_PROGRAM_ID, &[if settle { 2 } else { 3 }, 0], metas)
}

fn admit_ix(b: &Bond, authority: &Pubkey, t: &Trade) -> Instruction {
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::AdmitTrade {}.data(),
        qupon_bonds::accounts::AdmitTrade {
            authority: *authority,
            series: b.series,
            mint: b.mint,
            swap_dvp: t.swap,
            escrow: t.escrow,
            seller: investor_pda(&b.series, &t.seller.pubkey()),
            buyer: investor_pda(&b.series, &t.buyer.pubkey()),
            admission: admission_pda(b, &t.swap),
            bond_token_program: spl_token_2022::ID,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn release_ix(b: &Bond, authority: &Pubkey, t: &Trade, force: bool) -> Instruction {
    let seller = t.seller.pubkey();
    Instruction::new_with_bytes(
        qupon_bonds::id(),
        &qupon_bonds::instruction::ReleaseTrade { force }.data(),
        qupon_bonds::accounts::ReleaseTrade {
            authority: *authority,
            series: b.series,
            mint: b.mint,
            admission: admission_pda(b, &t.swap),
            escrow: t.escrow,
            seller: investor_pda(&b.series, &seller),
            seller_bond_ata: bond_ata(&seller, b),
            bond_token_program: spl_token_2022::ID,
        }
        .to_account_metas(None),
    )
}

/// Both parties fund their leg with a plain token transfer, as the DvP program expects.
fn fund(env: &mut Env, b: &Bond, t: &Trade) {
    let asset = bond_transfer(b, &t.seller.pubkey(), &t.swap, UNITS);
    let cash = spl_token::instruction::transfer(
        &spl_token::ID,
        &cash_ata(&t.buyer.pubkey(), b),
        &t.cash_escrow,
        &t.buyer.pubkey(),
        &[],
        CASH,
    )
    .unwrap();
    env.send(&[asset, cash], &[&t.seller, &t.buyer])
        .expect("fund both legs");
}

#[test]
fn admitted_trade_settles_and_is_released() {
    let (mut env, b, seller, buyer) = market();
    let registrar = env.registrar.pubkey();
    let t = create_dvp(&mut env, &b, &registrar, &seller, &buyer, 1);
    assert!(
        env.is_frozen(&t.escrow),
        "DefaultAccountState: the escrow starts frozen"
    );
    let early = bond_transfer(&b, &seller.pubkey(), &t.swap, UNITS);
    assert!(
        env.send(&[early], &[&seller]).is_err(),
        "no units enter before admission"
    );

    env.send(&[admit_ix(&b, &registrar, &t)], &[])
        .expect("admit");
    assert!(!env.is_frozen(&t.escrow));
    assert_eq!(open_trades(&env, &b), 1);
    let adm: TradeAdmission = env.account(&admission_pda(&b, &t.swap));
    assert_eq!(
        (adm.seller, adm.buyer, adm.units, adm.cash_amount),
        (seller.pubkey(), buyer.pubkey(), UNITS, CASH)
    );
    assert!(
        env.send(&[admit_ix(&b, &registrar, &t)], &[]).is_err(),
        "one admission per trade"
    );
    assert_eq!(open_trades(&env, &b), 1);

    fund(&mut env, &b, &t);
    assert_err(
        env.send(&[release_ix(&b, &registrar, &t, false)], &[]),
        QuponError::TradeStillOpen,
    );
    let settle = close_dvp_ix(&env, &b, &t, true);
    env.send(&[settle], &[]).expect("SettleDvp");
    assert_eq!(env.balance(&bond_ata(&buyer.pubkey(), &b)), 35);
    assert_eq!(env.balance(&bond_ata(&seller.pubkey(), &b)), 0);
    assert_eq!(env.balance(&cash_ata(&seller.pubkey(), &b)), CASH);
    assert_eq!(env.balance(&cash_ata(&buyer.pubkey(), &b)), 0);
    assert!(gone(&env, &t.escrow), "the DvP program closes the escrow");

    // Someone recreates the escrow ATA after the trade closed: it is frozen and does not block the release.
    let recreate = create_bond_ata_ix(&env, &b, &t.swap);
    env.send(&[recreate], &[]).expect("recreate the escrow");
    assert!(env.is_frozen(&t.escrow));
    env.send(&[release_ix(&b, &registrar, &t, false)], &[])
        .expect("release");
    assert_eq!(open_trades(&env, &b), 0);
    assert!(gone(&env, &admission_pda(&b, &t.swap)));
}

#[test]
fn record_date_waits_for_open_trades() {
    let (mut env, b, seller, buyer) = market();
    let registrar = env.registrar.pubkey();
    let t = create_dvp(&mut env, &b, &registrar, &seller, &buyer, 1);
    env.send(&[admit_ix(&b, &registrar, &t)], &[])
        .expect("admit");
    fund(&mut env, &b, &t);

    let now = env.now();
    let announce = env.announce_ix(&b, &registrar, intr_args(now));
    env.send(&[announce], &[]).expect("announce");
    env.set_clock(now + 60);
    let strike = env.strike_ix(&b, &registrar, 0);
    assert_err(
        env.send(std::slice::from_ref(&strike), &[]),
        QuponError::TradesInFlight,
    );

    // The settlement authority unwinds the trade, so the units are back with the seller before the register freezes.
    let cancel = close_dvp_ix(&env, &b, &t, false);
    env.send(&[cancel], &[]).expect("CancelDvp");
    env.send(&[release_ix(&b, &registrar, &t, false)], &[])
        .expect("release");
    env.send(&[strike], &[]).expect("strike");
    assert_eq!(env.balance(&bond_ata(&seller.pubkey(), &b)), UNITS);

    let mut owners = [seller.pubkey(), buyer.pubkey()];
    owners.sort();
    let snapshot = env.snapshot_ix(&b, 0, &owners);
    env.send(&[snapshot], &[]).expect("snapshot");
    let finalize = env.finalize_snapshot_ix(&b, 0);
    env.send(&[finalize], &[])
        .expect("every unit has a holder: Σ snapshot == supply");
}

#[test]
fn admit_rejects_foreign_or_ineligible_trades() {
    let (mut env, b, seller, buyer) = market();
    let registrar = env.registrar.pubkey();

    // A settlement authority that is not ours: no operator of the series could unwind it before a record date.
    let stranger = Keypair::new().pubkey();
    let foreign = create_dvp(&mut env, &b, &stranger, &seller, &buyer, 1);
    assert_err(
        env.send(&[admit_ix(&b, &registrar, &foreign)], &[]),
        QuponError::InvalidTrade,
    );

    // Bonds delivered to a wallet other than the buyer.
    let redirected = create_dvp_to(&mut env, &b, &registrar, &seller, &buyer, 3, Some(stranger));
    assert_err(
        env.send(&[admit_ix(&b, &registrar, &redirected)], &[]),
        QuponError::InvalidTrade,
    );

    let t = create_dvp(&mut env, &b, &registrar, &seller, &buyer, 2);
    let issuer = env.issuer.insecure_clone();
    assert_err(
        env.send(&[admit_ix(&b, &issuer.pubkey(), &t)], &[&issuer]),
        QuponError::Unauthorized,
    );
    // The investor records must be the trade's own parties (accounts 5 and 6 are seller and buyer).
    let mut swapped = admit_ix(&b, &registrar, &t);
    swapped.accounts.swap(5, 6);
    assert_err(env.send(&[swapped], &[]), QuponError::InvalidTrade);

    let suspend = env.set_status_ix(&b, &buyer.pubkey(), true);
    env.send(&[suspend], &[]).expect("suspend the buyer");
    assert_err(
        env.send(&[admit_ix(&b, &registrar, &t)], &[]),
        QuponError::InvestorSuspended,
    );
    assert_eq!(open_trades(&env, &b), 0);
    assert!(env.is_frozen(&t.escrow));
}

#[test]
fn releasing_an_unfunded_trade_refreezes_its_escrow() {
    let (mut env, b, seller, buyer) = market();
    let registrar = env.registrar.pubkey();
    let t = create_dvp(&mut env, &b, &registrar, &seller, &buyer, 1);
    env.send(&[admit_ix(&b, &registrar, &t)], &[])
        .expect("admit");

    env.send(&[release_ix(&b, &registrar, &t, false)], &[])
        .expect("release");
    assert_eq!(open_trades(&env, &b), 0);
    assert!(env.is_frozen(&t.escrow));
    let late = bond_transfer(&b, &seller.pubkey(), &t.swap, UNITS);
    assert!(
        env.send(&[late], &[&seller]).is_err(),
        "no units enter a released escrow"
    );

    // The DvP record is still open, so the trade can be admitted again.
    env.send(&[admit_ix(&b, &registrar, &t)], &[])
        .expect("admit again");
    assert_eq!(open_trades(&env, &b), 1);
}

#[test]
fn forced_release_unwinds_a_trade_that_cannot_be_cancelled() {
    let (mut env, b, seller, buyer) = market();
    let registrar = env.registrar.pubkey();
    let t = create_dvp(&mut env, &b, &registrar, &seller, &buyer, 1);
    env.send(&[admit_ix(&b, &registrar, &t)], &[])
        .expect("admit");
    fund(&mut env, &b, &t);

    // The seller closes their now-empty bond account: the DvP program has nowhere to refund the units.
    let seller_bonds = bond_ata(&seller.pubkey(), &b);
    let close = spl_token_2022::instruction::close_account(
        &spl_token_2022::ID,
        &seller_bonds,
        &seller.pubkey(),
        &seller.pubkey(),
        &[],
    )
    .unwrap();
    env.send(&[close], &[&seller])
        .expect("seller closes the bond account");
    let cancel = close_dvp_ix(&env, &b, &t, false);
    assert!(
        env.send(&[cancel], &[]).is_err(),
        "CancelDvp cannot refund the bond leg"
    );
    assert_err(
        env.send(&[release_ix(&b, &registrar, &t, false)], &[]),
        QuponError::TradeStillOpen,
    );
    assert_err(
        env.send(&[release_ix(&b, &registrar, &t, true)], &[]),
        QuponError::InvalidTrade,
    );

    // The operator recreates the ATA (frozen by default); the forced release thaws it and returns the units.
    let recreate = create_bond_ata_ix(&env, &b, &seller.pubkey());
    env.send(&[recreate, release_ix(&b, &registrar, &t, true)], &[])
        .expect("forced release");
    assert_eq!(env.balance(&seller_bonds), UNITS);
    assert!(!env.is_frozen(&seller_bonds));
    assert_eq!(env.balance(&t.escrow), 0);
    assert!(env.is_frozen(&t.escrow));
    assert_eq!(open_trades(&env, &b), 0);

    // The buyer takes the cash back alone (`ReclaimDvp` = 1).
    let buyer_cash = cash_ata(&buyer.pubkey(), &b);
    let reclaim = Instruction::new_with_bytes(
        DVP_PROGRAM_ID,
        &[1],
        vec![
            AccountMeta::new_readonly(buyer.pubkey(), true),
            AccountMeta::new_readonly(t.swap, false),
            AccountMeta::new_readonly(b.cash, false),
            AccountMeta::new(t.cash_escrow, false),
            AccountMeta::new(buyer_cash, false),
            AccountMeta::new_readonly(b.cash_tp, false),
            AccountMeta::new_readonly(MEMO, false),
        ],
    );
    env.send(&[reclaim], &[&buyer]).expect("ReclaimDvp");
    assert_eq!(env.balance(&buyer_cash), CASH);

    // The record date no longer depends on the trade: strike, snapshot both holders, Σ = supply.
    let now = env.now();
    let announce = env.announce_ix(&b, &registrar, intr_args(now));
    env.send(&[announce], &[]).expect("announce");
    env.set_clock(now + 60);
    let strike = env.strike_ix(&b, &registrar, 0);
    env.send(&[strike], &[]).expect("strike");
    let mut owners = [seller.pubkey(), buyer.pubkey()];
    owners.sort();
    let snapshot = env.snapshot_ix(&b, 0, &owners);
    env.send(&[snapshot], &[]).expect("snapshot");
    let finalize = env.finalize_snapshot_ix(&b, 0);
    env.send(&[finalize], &[]).expect("finalize");
}
