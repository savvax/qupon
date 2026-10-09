//! Bondholder meeting (BMET) → terms change (CHAN): snapshot-weighted votes, configurable quorum/approval
//! (series config, never claimed statutory — 03-domain §1), SIMULATED regulator registration.
use anchor_lang::{prelude::*, system_program};
use anchor_spl::{
    token_2022::Token2022,
    token_2022_extensions::{
        spl_token_metadata_interface::state::Field, token_metadata_update_field,
        TokenMetadataUpdateField,
    },
    token_interface::Mint,
};

use crate::{
    clock::SeriesClock,
    constants::*,
    error::QuponError,
    events::{MeetingFinalized, TermsChanged, VoteCast},
    state::{
        ActionKind, ActionStatus, CorporateAction, Entitlement, MeetingResult, Series, VoteChoice,
    },
};

#[derive(Accounts)]
pub struct CastVote<'info> {
    pub owner: Signer<'info>,
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    /// The voter's snapshot record: its units are the vote weight.
    #[account(
        mut,
        seeds = [ENTITLEMENT_SEED, action.key().as_ref(), owner.key().as_ref()],
        bump = entitlement.bump
    )]
    pub entitlement: Box<Account<'info, Entitlement>>,
}

pub fn handle_cast_vote(ctx: Context<CastVote>, choice: u8) -> Result<()> {
    let action = &ctx.accounts.action;
    require!(
        action.kind == ActionKind::Meeting as u8,
        QuponError::InvalidParams
    );
    require!(
        action.status == ActionStatus::VotingOpen as u8,
        QuponError::VotingClosed
    );
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp < action.voting_ends_at,
        QuponError::VotingClosed
    );
    let choice_enum = VoteChoice::try_from(choice)?;
    require!(choice_enum != VoteChoice::None, QuponError::InvalidParams);
    let ent = &mut ctx.accounts.entitlement;
    require!(ent.vote == VoteChoice::None as u8, QuponError::AlreadyVoted);

    let weight = ent.units;
    ent.vote = choice;
    ent.voted_at = clock.unix_timestamp;
    let action = &mut ctx.accounts.action;
    let tally = match choice_enum {
        VoteChoice::For => &mut action.votes_for,
        VoteChoice::Against => &mut action.votes_against,
        _ => &mut action.votes_abstain,
    };
    *tally = tally.checked_add(weight).ok_or(QuponError::MathOverflow)?;
    emit!(VoteCast {
        series: action.series,
        action: action.key(),
        index: action.index,
        owner: ctx.accounts.owner.key(),
        choice,
        weight,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeMeeting<'info> {
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
}

/// Quorum: votes cast (incl. abstentions) ≥ units × quorum_bps; approval: for ≥ (for + against) × approval_bps.
pub fn meeting_result(a: &CorporateAction, quorum_bps: u16, approval_bps: u16) -> MeetingResult {
    let cast = u128::from(a.votes_for) + u128::from(a.votes_against) + u128::from(a.votes_abstain);
    let bps = u128::from(BPS_DENOMINATOR);
    if cast * bps < u128::from(a.units_snapshotted) * u128::from(quorum_bps) {
        return MeetingResult::NoQuorum;
    }
    let decided = u128::from(a.votes_for) + u128::from(a.votes_against);
    if decided > 0 && u128::from(a.votes_for) * bps >= decided * u128::from(approval_bps) {
        MeetingResult::Approved
    } else {
        MeetingResult::Rejected
    }
}

pub fn handle_finalize_meeting(ctx: Context<FinalizeMeeting>) -> Result<()> {
    let action = &ctx.accounts.action;
    require!(
        action.kind == ActionKind::Meeting as u8,
        QuponError::InvalidParams
    );
    require!(
        action.status == ActionStatus::VotingOpen as u8,
        QuponError::WrongStatus
    );
    let clock = Clock::get()?;
    let cast = action
        .votes_for
        .saturating_add(action.votes_against)
        .saturating_add(action.votes_abstain);
    require!(
        clock.unix_timestamp >= action.voting_ends_at || cast == action.units_snapshotted,
        QuponError::VotingOpen
    );

    let series = &mut ctx.accounts.series;
    let result = meeting_result(action, series.quorum_bps, series.approval_bps);
    let action = &mut ctx.accounts.action;
    action.result = result as u8;
    action.status = ActionStatus::Finalized as u8;
    if result != MeetingResult::Approved {
        // Nothing to apply: the meeting is over and the series is free for the next action.
        series.open_action = None;
        action.completed_at = clock.unix_timestamp;
    }
    emit!(MeetingFinalized {
        series: series.key(),
        action: action.key(),
        index: action.index,
        votes_for: action.votes_for,
        votes_against: action.votes_against,
        votes_abstain: action.votes_abstain,
        units_snapshotted: action.units_snapshotted,
        result: action.result,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct ApplyTermsChange<'info> {
    /// Registrar: its signature stands in for the regulator (ARDFM) registration — SIMULATED.
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    #[account(mut)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn handle_apply_terms_change(ctx: Context<ApplyTermsChange>) -> Result<()> {
    let action = &ctx.accounts.action;
    require!(
        action.kind == ActionKind::Meeting as u8,
        QuponError::InvalidParams
    );
    require!(
        action.status == ActionStatus::Finalized as u8,
        QuponError::WrongStatus
    );
    require!(
        action.result == MeetingResult::Approved as u8,
        QuponError::NotApproved
    );

    let series = &ctx.accounts.series;
    let clock = SeriesClock::of(series)?;
    let (old_rate, old_maturity) = (series.coupon_rate_bps, series.maturity_date);
    let new_rate = if action.proposal_new_rate_bps > 0 {
        action.proposal_new_rate_bps
    } else {
        old_rate
    };
    let new_maturity = if action.proposal_new_maturity > 0 {
        require!(
            clock.is_midnight(action.proposal_new_maturity)
                && action.proposal_new_maturity >= series.next_coupon_date,
            QuponError::InvalidDates
        );
        action.proposal_new_maturity
    } else {
        old_maturity
    };

    // Token metadata mirrors the terms (registrar is the metadata update authority).
    let mut fields = vec![];
    if new_rate != old_rate {
        fields.push(("coupon_rate_bps", new_rate.to_string()));
    }
    if new_maturity != old_maturity {
        fields.push(("maturity", new_maturity.to_string()));
    }
    let mint_info = ctx.accounts.mint.to_account_info();
    let registrar = ctx.accounts.registrar.to_account_info();
    for (key, value) in fields {
        token_metadata_update_field(
            CpiContext::new(
                ctx.accounts.bond_token_program.key(),
                TokenMetadataUpdateField {
                    program_id: ctx.accounts.bond_token_program.to_account_info(),
                    metadata: mint_info.clone(),
                    update_authority: registrar.clone(),
                },
            ),
            Field::Key(key.into()),
            value,
        )?;
    }
    // The update may have grown the mint account; keep it rent-exempt.
    let needed = Rent::get()?
        .minimum_balance(mint_info.data_len())
        .saturating_sub(mint_info.lamports());
    if needed > 0 {
        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.key(),
                system_program::Transfer {
                    from: registrar,
                    to: mint_info,
                },
            ),
            needed,
        )?;
    }

    // Effective from the current unpaid coupon period onward (the next INTR announce must use the new rate).
    let clock = Clock::get()?;
    let series = &mut ctx.accounts.series;
    series.coupon_rate_bps = new_rate;
    series.maturity_date = new_maturity;
    series.next_coupon_date = series.next_coupon_date.min(new_maturity);
    series.open_action = None;
    let action = &mut ctx.accounts.action;
    action.status = ActionStatus::Completed as u8;
    action.completed_at = clock.unix_timestamp;
    emit!(TermsChanged {
        series: series.key(),
        action: action.key(),
        index: action.index,
        old_rate_bps: old_rate,
        new_rate_bps: new_rate,
        old_maturity,
        new_maturity,
        regulator_registration_simulated: true,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
