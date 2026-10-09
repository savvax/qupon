//! Secondary trades settle through the Solana DvP program (docs/03-domain.md §4a). Bond accounts are frozen by
//! default, so the trade's bond escrow can hold units only after `admit_trade`; `strike_record` refuses while any
//! admitted trade is open, because a paused mint blocks DvP settle, cancel and reclaim alike.
use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::{
        spl_token_2022::{extension::StateWithExtensions, state::Account as TokenAccountState},
        Token2022,
    },
    token_interface::{
        burn_checked, freeze_account, mint_to, thaw_account, transfer_checked, BurnChecked,
        FreezeAccount, Mint, MintTo, ThawAccount, TokenAccount, TransferChecked,
    },
};

use entitlement::DayCount;

use crate::{
    clock::SeriesClock,
    constants::*,
    error::{math_err, QuponError},
    events::{TradeAccrued, TradeAdmitted, TradeReleased},
    instructions::subscribe::require_active,
    state::{
        ActionKind, ActionStatus, Checkpoint, CorporateAction, Investor, InvestorStatus, Series,
        SeriesStatus, TradeAdmission,
    },
    utils::{mint_paused, require_operator},
};

/// Solana DvP `SwapDvp` account (v0.1.0, `program/src/state/swap_dvp.rs`): fixed size, no discriminator —
/// bump u8, then user_a, user_b, mint_a, mint_b, settlement_authority, token_program_a, token_program_b (32 each),
/// amount_a, amount_b, expiry, nonce (8 each), ref_string [64], user_a / user_b settlement destination (32 each), …
const SWAP_DVP_LEN: usize = 458;

struct SwapDvpTerms {
    user_a: Pubkey,
    user_b: Pubkey,
    mint_a: Pubkey,
    mint_b: Pubkey,
    settlement_authority: Pubkey,
    amount_a: u64,
    amount_b: u64,
    destination_a: Pubkey,
    destination_b: Pubkey,
}

fn read_swap_dvp(acc: &AccountInfo) -> Result<SwapDvpTerms> {
    let bad = || error!(QuponError::InvalidTrade);
    let d = acc.try_borrow_data()?;
    if *acc.owner != DVP_PROGRAM_ID || d.len() != SWAP_DVP_LEN {
        return Err(bad());
    }
    let key = |at: usize| Pubkey::try_from(&d[at..at + 32]).map_err(|_| bad());
    let num = |at: usize| {
        d[at..at + 8]
            .try_into()
            .map(u64::from_le_bytes)
            .map_err(|_| bad())
    };
    Ok(SwapDvpTerms {
        user_a: key(1)?,
        user_b: key(33)?,
        mint_a: key(65)?,
        mint_b: key(97)?,
        settlement_authority: key(129)?,
        amount_a: num(225)?,
        amount_b: num(233)?,
        destination_a: key(321)?,
        destination_b: key(353)?,
    })
}

/// `(amount, frozen)` of a live Token-2022 account.
fn token_state(acc: &AccountInfo) -> Result<(u64, bool)> {
    let data = acc.try_borrow_data()?;
    let state = StateWithExtensions::<TokenAccountState>::unpack(&data)
        .map_err(|_| error!(QuponError::InvalidTrade))?;
    Ok((state.base.amount, state.base.is_frozen()))
}

/// Freeze or thaw a bond account as the series PDA (the mint's freeze authority).
fn set_frozen<'info>(
    program: Pubkey,
    account: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    series: AccountInfo<'info>,
    seeds: &[&[u8]],
    frozen: bool,
) -> Result<()> {
    if frozen {
        freeze_account(CpiContext::new_with_signer(
            program,
            FreezeAccount {
                account,
                mint,
                authority: series,
            },
            &[seeds],
        ))
    } else {
        thaw_account(CpiContext::new_with_signer(
            program,
            ThawAccount {
                account,
                mint,
                authority: series,
            },
            &[seeds],
        ))
    }
}

#[derive(Accounts)]
pub struct AdmitTrade<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = mint,
        constraint = series.status == SeriesStatus::Active as u8 @ QuponError::SeriesNotActive
    )]
    pub series: Box<Account<'info, Series>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: Solana DvP `SwapDvp` record; owner, size and terms are verified by `read_swap_dvp`.
    pub swap_dvp: UncheckedAccount<'info>,
    /// The trade's bond-leg escrow: the ATA of `swap_dvp`, created frozen by `CreateDvp`.
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = swap_dvp,
        associated_token::token_program = bond_token_program
    )]
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(has_one = series)]
    pub seller: Box<Account<'info, Investor>>,
    #[account(has_one = series)]
    pub buyer: Box<Account<'info, Investor>>,
    #[account(
        init,
        payer = authority,
        space = 8 + TradeAdmission::INIT_SPACE,
        seeds = [TRADE_SEED, series.key().as_ref(), swap_dvp.key().as_ref()],
        bump
    )]
    pub admission: Box<Account<'info, TradeAdmission>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    /// CHECK: hooked series: the escrow owner's (SwapDvp) record-date checkpoint, created here (unused on legacy).
    #[account(mut, seeds = [CHECKPOINT_SEED, series.key().as_ref(), swap_dvp.key().as_ref()], bump)]
    pub escrow_checkpoint: UncheckedAccount<'info>,
    /// The series' open action, if any (decides the accrual start: ex-coupon after a coupon's record date).
    #[account(constraint = Some(open_action.key()) == series.open_action @ QuponError::InvalidParams)]
    pub open_action: Option<Box<Account<'info, CorporateAction>>>,
}

pub fn handle_admit_trade(ctx: Context<AdmitTrade>) -> Result<()> {
    let series = &ctx.accounts.series;
    require_operator(series, &ctx.accounts.authority.key())?;
    // A redemption's register is locked once armed: a trade admitted now could never settle (review of 1510).
    if series.hook == 1 && series.record_at != 0 {
        let kind = crate::state::ActionKind::try_from(series.record_kind)?;
        require!(
            !matches!(
                kind,
                crate::state::ActionKind::Redemption | crate::state::ActionKind::EarlyRedemption
            ),
            QuponError::RecordLocked
        );
    }
    require!(
        !mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintPaused
    );
    let terms = read_swap_dvp(&ctx.accounts.swap_dvp)?;
    // Bonds against the series' cash asset, delivered to the parties themselves, and settled by one of our operators.
    require!(
        terms.mint_a == series.mint
            && terms.mint_b == series.cash_mint
            && (terms.settlement_authority == series.registrar
                || terms.settlement_authority == series.paying_agent)
            && terms.destination_a == terms.user_a
            && terms.destination_b == terms.user_b,
        QuponError::InvalidTrade
    );
    for (investor, party) in [
        (&ctx.accounts.seller, terms.user_a),
        (&ctx.accounts.buyer, terms.user_b),
    ] {
        require_keys_eq!(investor.owner, party, QuponError::InvalidTrade);
        require_active(investor)?;
    }

    if ctx.accounts.escrow.is_frozen() {
        let mint = ctx.accounts.mint.key();
        set_frozen(
            ctx.accounts.bond_token_program.key(),
            ctx.accounts.escrow.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            series.to_account_info(),
            &[SERIES_SEED, mint.as_ref(), &[series.bump]],
            false,
        )?;
    }

    let clock = Clock::get()?;
    let adm = &mut ctx.accounts.admission;
    adm.bump = ctx.bumps.admission;
    adm.series = ctx.accounts.series.key();
    adm.swap_dvp = ctx.accounts.swap_dvp.key();
    adm.escrow = ctx.accounts.escrow.key();
    adm.seller = terms.user_a;
    adm.buyer = terms.user_b;
    adm.units = terms.amount_a;
    adm.cash_amount = terms.amount_b;
    adm.admitted_at = clock.unix_timestamp;

    if ctx.accounts.series.hook == 1 {
        let swap = ctx.accounts.swap_dvp.key();
        crate::instructions::hook::create_checkpoint(
            &ctx.accounts.authority.to_account_info(),
            &ctx.accounts.escrow_checkpoint.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &mut ctx.accounts.series,
            &swap,
        )?;
    }
    let series = &mut ctx.accounts.series;
    series.open_trades = series
        .open_trades
        .checked_add(1)
        .ok_or(QuponError::MathOverflow)?;
    // Accrued interest at admission (plan 15): from the running period start, or — between an open coupon's record
    // date and its payment — from that coupon's period end (negative: the seller keeps the coupon). Event only: the
    // price is the parties' business; the split makes it legible.
    {
        let s = &*series;
        require!(
            s.open_action.is_none() || ctx.accounts.open_action.is_some(),
            QuponError::InvalidParams
        );
        let ex_coupon_end = ctx.accounts.open_action.as_ref().and_then(|a| {
            let ex = a.kind == ActionKind::Interest as u8
                && [
                    ActionStatus::RecordStruck,
                    ActionStatus::SnapshotComplete,
                    ActionStatus::Funded,
                    ActionStatus::Settling,
                    ActionStatus::Defaulted,
                ]
                .iter()
                .any(|st| a.status == *st as u8);
            ex.then_some(a.period_end)
        });
        let clock_s = SeriesClock::of(s)?;
        let start = clock_s.civil(ex_coupon_end.unwrap_or(s.period_start))?;
        let settle = clock_s
            .0
            .floor_civil(clock.unix_timestamp)
            .map_err(math_err)?;
        let dc = DayCount::try_from(s.day_count).map_err(math_err)?;
        let (accrued, days) = entitlement::accrued_signed(
            terms.amount_a,
            s.face_value,
            s.coupon_rate_bps,
            dc,
            start,
            settle,
        )
        .map_err(math_err)?;
        let cash = i64::try_from(terms.amount_b).map_err(|_| error!(QuponError::MathOverflow))?;
        emit!(TradeAccrued {
            series: s.key(),
            swap_dvp: ctx.accounts.swap_dvp.key(),
            units: terms.amount_a,
            cash_amount: terms.amount_b,
            settle_ymd: u32::from(settle.y) * 10_000
                + u32::from(settle.m) * 100
                + u32::from(settle.d),
            accrued_days: days,
            accrued,
            clean: cash.checked_sub(accrued).ok_or(QuponError::MathOverflow)?,
            slot: clock.slot,
            timestamp: clock.unix_timestamp,
        });
    }
    emit!(TradeAdmitted {
        series: adm.series,
        swap_dvp: adm.swap_dvp,
        escrow: adm.escrow,
        seller: adm.seller,
        buyer: adm.buyer,
        units: adm.units,
        cash_amount: adm.cash_amount,
        open_trades: series.open_trades,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ReleaseTrade<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        seeds = [TRADE_SEED, series.key().as_ref(), admission.swap_dvp.as_ref()],
        bump = admission.bump,
        has_one = series,
        has_one = escrow,
        close = authority
    )]
    pub admission: Box<Account<'info, TradeAdmission>>,
    /// CHECK: the admitted escrow (`has_one`): closed by the DvP program, or still a token account (checked below).
    #[account(mut)]
    pub escrow: UncheckedAccount<'info>,
    #[account(
        has_one = series,
        constraint = seller.owner == admission.seller @ QuponError::InvalidTrade
    )]
    pub seller: Box<Account<'info, Investor>>,
    /// CHECK: the seller's registered bond account (address pinned); only a forced release reads and credits it.
    #[account(mut, address = seller.bond_ata @ QuponError::InvalidTrade)]
    pub seller_bond_ata: UncheckedAccount<'info>,
    pub bond_token_program: Program<'info, Token2022>,
    /// CHECK: hooked series: the escrow owner's checkpoint, closed here (rent → authority); unused on legacy series.
    #[account(mut, seeds = [CHECKPOINT_SEED, series.key().as_ref(), admission.swap_dvp.as_ref()], bump)]
    pub escrow_checkpoint: UncheckedAccount<'info>,
}

pub fn handle_release_trade(ctx: Context<ReleaseTrade>, force: bool) -> Result<()> {
    require_operator(&ctx.accounts.series, &ctx.accounts.authority.key())?;
    let hooked = ctx.accounts.series.hook == 1;
    if hooked {
        // Between `record_at` and the final snapshot the escrow's position is part of the record: keep it.
        let s = &ctx.accounts.series;
        require!(
            s.record_at == 0 || Clock::get()?.unix_timestamp < s.record_at,
            QuponError::RecordPending
        );
    }
    let program = ctx.accounts.bond_token_program.key();
    let mint_key = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint_key.as_ref(), &[ctx.accounts.series.bump]];
    let mint = ctx.accounts.mint.to_account_info();
    let series_info = ctx.accounts.series.to_account_info();
    let escrow = ctx.accounts.escrow.to_account_info();

    // Settle/Cancel/Reject close the escrow. If it is still a token account — the trade was never funded, cannot be
    // unwound, or someone recreated the ATA — it leaves this instruction empty and frozen.
    let mut returned_units = 0;
    if *escrow.owner == program {
        let (amount, frozen) = token_state(&escrow)?;
        if amount > 0 {
            require!(force, QuponError::TradeStillOpen);
            // Forced unwind: the series PDA is the bond's permanent delegate, so a record date depends neither on the
            // parties nor on the DvP program, whose cancel reverts when any refund account is closed or frozen.
            let dest = ctx.accounts.seller_bond_ata.to_account_info();
            require_keys_eq!(*dest.owner, program, QuponError::InvalidTrade);
            if token_state(&dest)?.1 {
                set_frozen(
                    program,
                    dest.clone(),
                    mint.clone(),
                    series_info.clone(),
                    seeds,
                    false,
                )?;
            }
            if hooked {
                // A transfer would make Token-2022 call this program's hook from inside this program, which Solana
                // forbids (re-entrancy); burn as permanent delegate and mint the same units to the seller instead.
                burn_checked(
                    CpiContext::new_with_signer(
                        program,
                        BurnChecked {
                            mint: mint.clone(),
                            from: escrow.clone(),
                            authority: series_info.clone(),
                        },
                        &[seeds],
                    ),
                    amount,
                    ctx.accounts.mint.decimals,
                )?;
                mint_to(
                    CpiContext::new_with_signer(
                        program,
                        MintTo {
                            mint: mint.clone(),
                            to: dest.clone(),
                            authority: series_info.clone(),
                        },
                        &[seeds],
                    ),
                    amount,
                )?;
            } else {
                transfer_checked(
                    CpiContext::new_with_signer(
                        program,
                        TransferChecked {
                            from: escrow.clone(),
                            mint: mint.clone(),
                            to: dest.clone(),
                            authority: series_info.clone(),
                        },
                        &[seeds],
                    ),
                    amount,
                    ctx.accounts.mint.decimals,
                )?;
            }
            if ctx.accounts.seller.status == InvestorStatus::Suspended as u8 {
                set_frozen(
                    program,
                    dest,
                    mint.clone(),
                    series_info.clone(),
                    seeds,
                    true,
                )?;
            }
            returned_units = amount;
        }
        if !frozen {
            set_frozen(program, escrow, mint, series_info, seeds, true)?;
        }
    }

    let ckpt = ctx.accounts.escrow_checkpoint.to_account_info();
    if hooked && *ckpt.owner == crate::ID && !ckpt.data_is_empty() {
        Checkpoint::try_deserialize(&mut &ckpt.try_borrow_data()?[..])?; // it is a checkpoint
        let dest = ctx.accounts.authority.to_account_info();
        let rent = ckpt.lamports();
        **dest.try_borrow_mut_lamports()? = dest
            .lamports()
            .checked_add(rent)
            .ok_or(QuponError::MathOverflow)?;
        **ckpt.try_borrow_mut_lamports()? = 0;
        ckpt.assign(&anchor_lang::system_program::ID);
        ckpt.resize(0)?;
        ctx.accounts.series.ckpt_count = ctx
            .accounts
            .series
            .ckpt_count
            .checked_sub(1)
            .ok_or(QuponError::MathOverflow)?;
    }
    let series = &mut ctx.accounts.series;
    series.open_trades = series
        .open_trades
        .checked_sub(1)
        .ok_or(QuponError::MathOverflow)?;
    let clock = Clock::get()?;
    emit!(TradeReleased {
        series: series.key(),
        swap_dvp: ctx.accounts.admission.swap_dvp,
        escrow: ctx.accounts.admission.escrow,
        returned_units,
        open_trades: series.open_trades,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
