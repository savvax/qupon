//! Disclosure anchoring (plan 15 D9): the registrar anchors the sha256 of the action's official notification
//! (seev.031 XML, generated deterministically from chain state) once; anyone can re-hash the served file and compare.
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::QuponError,
    events::DisclosureAttached,
    state::{ActionStatus, CorporateAction, Series},
};

#[derive(Accounts)]
pub struct AttachDisclosure<'info> {
    pub registrar: Signer<'info>,
    #[account(has_one = registrar @ QuponError::Unauthorized)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
}

pub fn handle_attach_disclosure(ctx: Context<AttachDisclosure>, hash: [u8; 32]) -> Result<()> {
    require!(hash != [0u8; 32], QuponError::InvalidParams);
    let action = &mut ctx.accounts.action;
    require!(
        action.status != ActionStatus::Cancelled as u8,
        QuponError::WrongStatus
    );
    require!(
        action.disclosure_hash == [0u8; 32],
        QuponError::AlreadyAttached
    );
    action.disclosure_hash = hash;
    let clock = Clock::get()?;
    emit!(DisclosureAttached {
        series: action.series,
        action: action.key(),
        index: action.index,
        hash,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
