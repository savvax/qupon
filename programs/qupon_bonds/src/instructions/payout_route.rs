//! Holder-chosen payout route (plan 15 D6): a holder may ask for payouts to a bank account instead of their wallet.
//! Only the holder's own signature sets the route (nobody can redirect a payout). Bank-routed payouts go to the
//! paying agent's cash account; the agent confirms the bank transfer (SIMULATED) with a reference hash, and the
//! action completes only once every bank payout is confirmed.
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::QuponError,
    events::{BankPayoutConfirmed, PayoutRouteSet},
    state::{
        ActionKind, CorporateAction, Entitlement, EntitlementStatus, Investor, PayoutRoute,
        PayoutRouteKind, Series,
    },
    utils::create_pda_account,
};

#[derive(Accounts)]
pub struct SetPayoutRoute<'info> {
    /// The holder (pays rent on first use).
    #[account(mut)]
    pub owner: Signer<'info>,
    pub series: Box<Account<'info, Series>>,
    #[account(
        has_one = series,
        has_one = owner @ QuponError::Unauthorized
    )]
    pub investor: Box<Account<'info, Investor>>,
    /// CHECK: `["route", investor]`, created here on first use.
    #[account(mut, seeds = [PAYOUT_ROUTE_SEED, investor.key().as_ref()], bump)]
    pub route: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

pub fn handle_set_payout_route(
    ctx: Context<SetPayoutRoute>,
    route: u8,
    bank_ref_hash: [u8; 32],
) -> Result<()> {
    let kind = PayoutRouteKind::try_from(route)?;
    let zero = bank_ref_hash == [0u8; 32];
    require!(
        match kind {
            PayoutRouteKind::Wallet => zero,
            PayoutRouteKind::Bank => !zero,
        },
        QuponError::InvalidParams
    );
    let investor = ctx.accounts.investor.key();
    let info = ctx.accounts.route.to_account_info();
    if info.data_is_empty() {
        create_pda_account(
            &ctx.accounts.owner.to_account_info(),
            &info,
            &ctx.accounts.system_program.to_account_info(),
            8 + PayoutRoute::INIT_SPACE,
            &[PAYOUT_ROUTE_SEED, investor.as_ref(), &[ctx.bumps.route]],
        )?;
    }
    let clock = Clock::get()?;
    let record = PayoutRoute {
        bump: ctx.bumps.route,
        investor,
        route,
        bank_ref_hash,
        updated_at: clock.unix_timestamp,
    };
    record.try_serialize(&mut &mut info.try_borrow_mut_data()?[..])?;
    emit!(PayoutRouteSet {
        series: ctx.accounts.series.key(),
        investor,
        owner: ctx.accounts.owner.key(),
        route,
        bank_ref_hash,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ConfirmBankPayout<'info> {
    pub paying_agent: Signer<'info>,
    #[account(has_one = paying_agent @ QuponError::Unauthorized)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(
        mut,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), entitlement.owner.as_ref()],
        bump = entitlement.bump,
        constraint = entitlement.action == action.key() @ QuponError::InvalidParams
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
}

pub fn handle_confirm_bank_payout(
    ctx: Context<ConfirmBankPayout>,
    reference_hash: [u8; 32],
) -> Result<()> {
    require!(reference_hash != [0u8; 32], QuponError::InvalidParams);
    let ent = &mut ctx.accounts.entitlement;
    require!(
        ent.status == EntitlementStatus::PaidToAgent as u8,
        QuponError::WrongStatus
    );
    let action = &mut ctx.accounts.action;
    let redemption = matches!(
        ActionKind::try_from(action.kind)?,
        ActionKind::Redemption | ActionKind::EarlyRedemption
    );
    ent.status = if redemption {
        EntitlementStatus::Retired
    } else {
        EntitlementStatus::Paid
    } as u8;
    action.bank_pending = action
        .bank_pending
        .checked_sub(1)
        .ok_or(QuponError::MathOverflow)?;
    let clock = Clock::get()?;
    emit!(BankPayoutConfirmed {
        series: action.series,
        action: action.key(),
        index: action.index,
        owner: ent.owner,
        reference_hash,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
