//! Default and cure (plan 15 D4). Anyone can declare a default once the payment date plus one series day has
//! passed and the escrow still does not cover the action; the claims stay with the record-date holders in their
//! Entitlement PDAs, coupons keep trading (the record is final), redemptions keep the register frozen. Funding the
//! shortfall later cures the default (`fund_action`).
use anchor_lang::prelude::*;
use anchor_spl::token_interface::TokenAccount;

use crate::{
    clock::SeriesClock,
    constants::*,
    error::QuponError,
    events::ActionDefaulted,
    instructions::settle::required_funding,
    state::{ActionStatus, CorporateAction, Series},
};

#[derive(Accounts)]
pub struct DeclareDefault<'info> {
    /// Anyone (pays the fee).
    pub payer: Signer<'info>,
    #[account(mut)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series,
        has_one = escrow
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub escrow: Box<InterfaceAccount<'info, TokenAccount>>,
}

pub fn handle_declare_default(ctx: Context<DeclareDefault>) -> Result<()> {
    let clock = Clock::get()?;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::SnapshotComplete as u8,
        QuponError::WrongStatus
    );
    let grace = SeriesClock::of(&ctx.accounts.series)?.grace();
    let due = action
        .payment_at
        .checked_add(grace)
        .ok_or(QuponError::MathOverflow)?;
    require!(clock.unix_timestamp >= due, QuponError::NotOverdue);
    let required = required_funding(action)?;
    let balance = ctx.accounts.escrow.amount;
    require!(balance < required, QuponError::WrongStatus);

    let action = &mut ctx.accounts.action;
    action.status = ActionStatus::Defaulted as u8;
    action.defaulted_at = clock.unix_timestamp;
    let series = &mut ctx.accounts.series;
    series.in_default = 1;
    series.defaults_count = series
        .defaults_count
        .checked_add(1)
        .ok_or(QuponError::MathOverflow)?;
    emit!(ActionDefaulted {
        series: series.key(),
        action: action.key(),
        index: action.index,
        kind: action.kind,
        required,
        escrow_balance: balance,
        shortfall: required - balance,
        payment_at: action.payment_at,
        defaulted_at: clock.unix_timestamp,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
