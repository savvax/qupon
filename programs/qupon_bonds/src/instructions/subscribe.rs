use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{
        mint_to, transfer_checked, Mint, MintTo, TokenAccount, TokenInterface, TransferChecked,
    },
};

use crate::{
    constants::*,
    error::QuponError,
    events::{Subscribed, UnitsIssued},
    state::{InvestorStatus, Series, SeriesStatus},
    utils::{mint_paused, mul_amount},
    Investor,
};

/// Primary placement as atomic DvP: cash investor → issuer and bond units minted to the investor, in one instruction.
#[derive(Accounts)]
pub struct Subscribe<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        has_one = mint,
        has_one = cash_mint,
        constraint = series.status == SeriesStatus::Active as u8 @ QuponError::SeriesNotActive
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        seeds = [INVESTOR_SEED, series.key().as_ref(), owner.key().as_ref()],
        bump = investor.bump,
        has_one = owner @ QuponError::AccountOwnerMismatch,
        has_one = bond_ata,
        has_one = cash_ata
    )]
    pub investor: Box<Account<'info, Investor>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub bond_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    /// Investor's cash account (the one recorded at registration).
    #[account(mut)]
    pub cash_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    /// Any cash account of the issuer for `cash_mint`.
    #[account(
        mut,
        token::mint = cash_mint,
        token::authority = series.issuer,
        token::token_program = cash_token_program
    )]
    pub issuer_cash: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub cash_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_subscribe(ctx: Context<Subscribe>, units: u64, price_per_unit: u64) -> Result<()> {
    require!(units > 0, QuponError::NothingToDo);
    // Placement at par: the price is a series term, not the investor's choice.
    require!(
        price_per_unit == ctx.accounts.series.face_value,
        QuponError::InvalidParams
    );
    require_active(&ctx.accounts.investor)?;
    require!(
        !mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintPaused
    );
    let cash_paid = mul_amount(units, price_per_unit)?;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.cash_token_program.key(),
            TransferChecked {
                from: ctx.accounts.cash_ata.to_account_info(),
                mint: ctx.accounts.cash_mint.to_account_info(),
                to: ctx.accounts.issuer_cash.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        cash_paid,
        ctx.accounts.cash_mint.decimals,
    )?;
    mint_units(
        &ctx.accounts.series,
        &ctx.accounts.mint,
        &ctx.accounts.bond_ata,
        &ctx.accounts.bond_token_program,
        units,
    )?;

    let series = &mut ctx.accounts.series;
    series.total_issued = series
        .total_issued
        .checked_add(units)
        .ok_or(QuponError::MathOverflow)?;
    let clock = Clock::get()?;
    emit!(Subscribed {
        series: series.key(),
        owner: ctx.accounts.owner.key(),
        units,
        price_per_unit,
        cash_paid,
        total_issued: series.total_issued,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// Free allocation by the issuer (no cash leg).
#[derive(Accounts)]
pub struct IssueUnits<'info> {
    pub issuer: Signer<'info>,
    #[account(
        mut,
        has_one = issuer @ QuponError::Unauthorized,
        has_one = mint,
        constraint = series.status == SeriesStatus::Active as u8 @ QuponError::SeriesNotActive
    )]
    pub series: Box<Account<'info, Series>>,
    #[account(
        seeds = [INVESTOR_SEED, series.key().as_ref(), investor.owner.as_ref()],
        bump = investor.bump,
        has_one = series,
        has_one = bond_ata
    )]
    pub investor: Box<Account<'info, Investor>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub bond_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
}

pub fn handle_issue_units(ctx: Context<IssueUnits>, units: u64) -> Result<()> {
    require!(units > 0, QuponError::NothingToDo);
    require_active(&ctx.accounts.investor)?;
    require!(
        !mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintPaused
    );
    mint_units(
        &ctx.accounts.series,
        &ctx.accounts.mint,
        &ctx.accounts.bond_ata,
        &ctx.accounts.bond_token_program,
        units,
    )?;
    let series = &mut ctx.accounts.series;
    series.total_issued = series
        .total_issued
        .checked_add(units)
        .ok_or(QuponError::MathOverflow)?;
    let clock = Clock::get()?;
    emit!(UnitsIssued {
        series: series.key(),
        owner: ctx.accounts.investor.owner,
        units,
        total_issued: series.total_issued,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

pub(crate) fn require_active(investor: &Investor) -> Result<()> {
    require!(
        investor.status != InvestorStatus::Suspended as u8,
        QuponError::InvestorSuspended
    );
    require!(
        investor.status == InvestorStatus::Active as u8,
        QuponError::InvestorNotActive
    );
    Ok(())
}

fn mint_units<'info>(
    series: &Account<'info, Series>,
    mint: &InterfaceAccount<'info, Mint>,
    to: &InterfaceAccount<'info, TokenAccount>,
    program: &Program<'info, Token2022>,
    units: u64,
) -> Result<()> {
    // Hooked series: new units after `record_at` would change balances behind the gate's back (plan 15 D1').
    require!(
        !(series.hook == 1
            && series.record_at != 0
            && Clock::get()?.unix_timestamp >= series.record_at),
        QuponError::RecordPending
    );
    let mint_key = mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint_key.as_ref(), &[series.bump]];
    mint_to(
        CpiContext::new_with_signer(
            program.key(),
            MintTo {
                mint: mint.to_account_info(),
                to: to.to_account_info(),
                authority: series.to_account_info(),
            },
            &[seeds],
        ),
        units,
    )
}
