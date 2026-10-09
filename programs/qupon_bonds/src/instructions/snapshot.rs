//! Record-date mechanism (03-domain §4, plan 15 D1'). Hooked series: the transfer-hook gate freezes every position at
//! `record_at` until it is snapshotted, so `snapshot_batch` runs from `record_at` without pausing the mint. Legacy
//! series: pause the bond mint, snapshot every holder on-chain, check supply. Every step is permissionless.
use anchor_lang::{prelude::*, Discriminator};
use anchor_spl::{
    token_2022::Token2022,
    token_2022_extensions::{pausable_pause, pausable_resume, PausableToggle},
    token_interface::{Mint, TokenAccount},
};
use entitlement::{DayCount, Kind};

use crate::{
    constants::*,
    error::{math_err, QuponError},
    events::{HolderSnapshotted, RecordStruck, SnapshotFinalized},
    instructions::hook::{set_hash_leaf, xor_into},
    state::{
        ActionKind, ActionStatus, Checkpoint, CorporateAction, Entitlement, EntitlementStatus,
        Investor, Series, TradeAdmission, VoteChoice,
    },
    utils::{create_pda_account, mint_paused, require_operator},
};

/// Max holders (legacy triples) or positions (hooked groups) per `snapshot_batch` (docs/02 batch sizing).
pub const SNAPSHOT_BATCH_MAX: usize = 8;

#[derive(Accounts)]
pub struct StrikeRecord<'info> {
    /// Anyone (pays the fee).
    pub authority: Signer<'info>,
    #[account(has_one = mint)]
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
}

/// Legacy series only: pause the mint at the record date (anyone). Hooked series need no strike.
pub fn handle_strike_record(ctx: Context<StrikeRecord>) -> Result<()> {
    require!(ctx.accounts.series.hook == 0, QuponError::WrongStatus);
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::Announced as u8,
        QuponError::WrongStatus
    );
    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= action.record_at,
        QuponError::TooEarly
    );
    // Units inside a DvP escrow cannot leave it while the mint is paused and have no holder to snapshot.
    require!(
        ctx.accounts.series.open_trades == 0,
        QuponError::TradesInFlight
    );

    // Freeze the register: no transfers, mints or burns until the snapshot is final (INTR/PCAL/BMET) or paid.
    let mint = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
    pausable_pause(CpiContext::new_with_signer(
        ctx.accounts.bond_token_program.key(),
        PausableToggle {
            token_program_id: ctx.accounts.bond_token_program.to_account_info(),
            mint: ctx.accounts.mint.to_account_info(),
            authority: ctx.accounts.series.to_account_info(),
        },
        &[seeds],
    ))?;

    let action = &mut ctx.accounts.action;
    struck(action, &clock);
    Ok(())
}

fn struck(action: &mut Account<CorporateAction>, clock: &Clock) {
    action.status = ActionStatus::RecordStruck as u8;
    action.snapshot_slot = clock.slot;
    emit!(RecordStruck {
        series: action.series,
        action: action.key(),
        index: action.index,
        record_at: action.record_at,
        snapshot_slot: clock.slot,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
}

#[derive(Accounts)]
pub struct SnapshotBatch<'info> {
    /// Anyone; pays rent for new Entitlement accounts.
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [ACTION_SEED, series.key().as_ref(), &action.index.to_le_bytes()],
        bump = action.bump,
        has_one = series
    )]
    pub action: Box<Account<'info, CorporateAction>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub system_program: Program<'info, System>,
}

/// Legacy: `remaining_accounts` = N × [Investor PDA, bond ATA, Entitlement PDA (writable)].
/// Hooked: a sequence of positions — an investor's ATA `[Investor, bond ATA, Entitlement (w), Checkpoint (w)]` or an
/// admitted DvP escrow `[TradeAdmission, escrow ATA, seller's Entitlement (w), escrow Checkpoint (w), seller Investor]`.
/// Idempotent: processed positions and zero balances are skipped, so a re-sent batch is a no-op.
pub fn handle_snapshot_batch<'info>(ctx: Context<'info, SnapshotBatch<'info>>) -> Result<()> {
    if ctx.accounts.series.hook == 1 {
        return snapshot_positions(ctx);
    }
    let series = &ctx.accounts.series;
    require!(
        ctx.accounts.action.status == ActionStatus::RecordStruck as u8,
        QuponError::WrongStatus
    );
    // Actions announced before plan 15 keep the owner-ordered rolling hash: only operators may batch them.
    if ctx.accounts.action.hash_scheme == 0 {
        require_operator(series, &ctx.accounts.authority.key())?;
    }
    require!(
        mint_paused(&ctx.accounts.mint.to_account_info())?,
        QuponError::MintNotPaused
    );
    let rem = ctx.remaining_accounts;
    require!(rem.len().is_multiple_of(3), QuponError::InvalidParams);
    require!(
        rem.len() / 3 <= SNAPSHOT_BATCH_MAX,
        QuponError::BatchTooLarge
    );

    for t in rem.chunks(3) {
        let investor: Account<Investor> = Account::try_from(&t[0])?;
        require_keys_eq!(
            investor.series,
            series.key(),
            QuponError::AccountOwnerMismatch
        );
        require_keys_eq!(
            t[1].key(),
            investor.bond_ata,
            QuponError::AccountOwnerMismatch
        );
        let ata: InterfaceAccount<TokenAccount> = InterfaceAccount::try_from(&t[1])?;
        require_keys_eq!(ata.mint, series.mint, QuponError::AccountMintMismatch);
        require_keys_eq!(ata.owner, investor.owner, QuponError::AccountOwnerMismatch);
        if ata.amount == 0 || !t[2].data_is_empty() {
            continue; // nothing held, or already snapshotted (AlreadyProcessed is not an error inside a batch)
        }
        add_units(
            &ctx.accounts.authority.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            series,
            &mut ctx.accounts.action,
            &investor,
            &t[2],
            ata.key(),
            ata.amount,
        )?;
    }
    Ok(())
}

fn snapshot_positions<'info>(ctx: Context<'info, SnapshotBatch<'info>>) -> Result<()> {
    let clock = Clock::get()?;
    let series = &ctx.accounts.series;
    let action_key = ctx.accounts.action.key();
    if ctx.remaining_accounts.is_empty() {
        return Ok(()); // an empty batch must not strike the record (it would end the registrar's cancel window)
    }
    {
        let action = &mut ctx.accounts.action;
        require!(
            series.open_action == Some(action_key)
                && series.record_seq
                    == action
                        .index
                        .checked_add(1)
                        .ok_or(QuponError::MathOverflow)?,
            QuponError::WrongStatus
        );
        require!(
            clock.unix_timestamp >= action.record_at,
            QuponError::TooEarly
        );
        if action.status == ActionStatus::Announced as u8 {
            struck(action, &clock);
        }
        require!(
            action.status == ActionStatus::RecordStruck as u8,
            QuponError::WrongStatus
        );
    }

    let rem = ctx.remaining_accounts;
    let (mut i, mut positions) = (0usize, 0usize);
    while i < rem.len() {
        positions += 1;
        require!(positions <= SNAPSHOT_BATCH_MAX, QuponError::BatchTooLarge);
        let head = &rem[i];
        require_keys_eq!(*head.owner, crate::ID, QuponError::InvalidParams);
        let is_investor = head.try_borrow_data()?.starts_with(Investor::DISCRIMINATOR);
        if is_investor {
            require!(i + 4 <= rem.len(), QuponError::InvalidParams);
            let investor: Account<Investor> = Account::try_from(head)?;
            require_keys_eq!(
                investor.series,
                series.key(),
                QuponError::AccountOwnerMismatch
            );
            require_keys_eq!(
                rem[i + 1].key(),
                investor.bond_ata,
                QuponError::AccountOwnerMismatch
            );
            // An investor may close an empty bond ATA: a closed account is a position holding nothing.
            let units = if rem[i + 1].data_is_empty() {
                0
            } else {
                let ata: InterfaceAccount<TokenAccount> = InterfaceAccount::try_from(&rem[i + 1])?;
                require_keys_eq!(ata.mint, series.mint, QuponError::AccountMintMismatch);
                require_keys_eq!(ata.owner, investor.owner, QuponError::AccountOwnerMismatch);
                ata.amount
            };
            if advance_checkpoint(
                series,
                &mut ctx.accounts.action,
                &rem[i + 3],
                &investor.owner,
            )? {
                add_units(
                    &ctx.accounts.authority.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    series,
                    &mut ctx.accounts.action,
                    &investor,
                    &rem[i + 2],
                    investor.bond_ata,
                    units,
                )?;
            }
            i += 4;
        } else {
            require!(i + 5 <= rem.len(), QuponError::InvalidParams);
            let adm: Account<TradeAdmission> = Account::try_from(head)?;
            require_keys_eq!(adm.series, series.key(), QuponError::InvalidTrade);
            require_keys_eq!(rem[i + 1].key(), adm.escrow, QuponError::InvalidTrade);
            // Settle/Cancel close the escrow ATA: a closed escrow is a position holding nothing.
            let escrow_units = if rem[i + 1].data_is_empty() {
                0
            } else {
                let escrow: InterfaceAccount<TokenAccount> =
                    InterfaceAccount::try_from(&rem[i + 1])?;
                require_keys_eq!(escrow.mint, series.mint, QuponError::AccountMintMismatch);
                require_keys_eq!(escrow.owner, adm.swap_dvp, QuponError::InvalidTrade);
                escrow.amount
            };
            let seller: Account<Investor> = Account::try_from(&rem[i + 4])?;
            require_keys_eq!(seller.series, series.key(), QuponError::InvalidTrade);
            require_keys_eq!(seller.owner, adm.seller, QuponError::InvalidTrade);
            // Escrowed units at `record_at` still belong to the seller: the trade has not settled.
            if advance_checkpoint(series, &mut ctx.accounts.action, &rem[i + 3], &adm.swap_dvp)? {
                add_units(
                    &ctx.accounts.authority.to_account_info(),
                    &ctx.accounts.system_program.to_account_info(),
                    series,
                    &mut ctx.accounts.action,
                    &seller,
                    &rem[i + 2],
                    adm.escrow,
                    escrow_units,
                )?;
            }
            i += 5;
        }
    }
    Ok(())
}

/// Move `owner`'s checkpoint to the pending record; `false` if it was already there (position counted before).
fn advance_checkpoint(
    series: &Account<Series>,
    action: &mut CorporateAction,
    info: &AccountInfo,
    owner: &Pubkey,
) -> Result<bool> {
    let (pda, _) = Pubkey::find_program_address(
        &[CHECKPOINT_SEED, series.key().as_ref(), owner.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(info.key(), pda, QuponError::InvalidParams);
    require_keys_eq!(*info.owner, crate::ID, QuponError::InvalidParams);
    let mut c = Checkpoint::try_deserialize(&mut &info.try_borrow_data()?[..])?;
    if c.last_seq >= series.record_seq {
        return Ok(false);
    }
    c.last_seq = series.record_seq;
    c.try_serialize(&mut &mut info.try_borrow_mut_data()?[..])?;
    action.positions_done = action
        .positions_done
        .checked_add(1)
        .ok_or(QuponError::MathOverflow)?;
    Ok(true)
}

/// Add `units` held in `position` to `investor`'s entitlement for this action, creating it on first use. The
/// entitlement is recomputed on the holder's total, so rounding stays once per holder however many positions they
/// have; the set hash swaps the holder's old leaf for the new one.
#[allow(clippy::too_many_arguments)]
fn add_units<'info>(
    payer: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    series: &Series,
    action: &mut Account<'info, CorporateAction>,
    investor: &Investor,
    ent_info: &AccountInfo<'info>,
    position: Pubkey,
    units: u64,
) -> Result<()> {
    if units == 0 {
        return Ok(());
    }
    let action_key = action.key();
    let owner = investor.owner;
    let (pda, bump) = Pubkey::find_program_address(
        &[ENTITLEMENT_SEED, action_key.as_ref(), owner.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(ent_info.key(), pda, QuponError::InvalidParams);
    let mut record = if ent_info.data_is_empty() {
        let space = Entitlement::DISCRIMINATOR.len() + Entitlement::INIT_SPACE;
        create_pda_account(
            payer,
            ent_info,
            system_program,
            space,
            &[
                ENTITLEMENT_SEED,
                action_key.as_ref(),
                owner.as_ref(),
                &[bump],
            ],
        )?;
        Entitlement {
            bump,
            action: action_key,
            owner,
            units: 0,
            gross: 0,
            tax: 0,
            net: 0,
            principal: 0,
            status: EntitlementStatus::Snapshotted as u8,
            paid_at: 0,
            vote: VoteChoice::None as u8,
            voted_at: 0,
        }
    } else {
        // Only the hooked path can reach an existing entitlement (a seller with an escrowed position).
        require!(action.hash_scheme == 1, QuponError::AlreadyProcessed);
        let e = Entitlement::try_deserialize(&mut &ent_info.try_borrow_data()?[..])?;
        require!(
            e.action == action_key && e.owner == owner,
            QuponError::InvalidParams
        );
        e
    };

    let total = record
        .units
        .checked_add(units)
        .ok_or(QuponError::MathOverflow)?;
    let kind = action_kind(action)?;
    let dc = DayCount::try_from(series.day_count).map_err(math_err)?;
    let e = entitlement::entitlement(
        total,
        series.face_value,
        action.rate_bps,
        dc,
        action.accrual_days,
        investor.tax_rate_bps,
        kind,
    )
    .map_err(math_err)?;

    let delta = |sum: u64, old: u64, new: u64| -> Result<u64> {
        sum.checked_sub(old)
            .and_then(|x| x.checked_add(new))
            .ok_or_else(|| error!(QuponError::MathOverflow))
    };
    action.units_snapshotted = action
        .units_snapshotted
        .checked_add(units)
        .ok_or(QuponError::MathOverflow)?;
    action.total_gross = delta(action.total_gross, record.gross, e.gross)?;
    action.total_tax = delta(action.total_tax, record.tax, e.tax)?;
    action.total_net = delta(action.total_net, record.net, e.net)?;
    action.total_principal = delta(action.total_principal, record.principal, e.principal)?;
    if action.hash_scheme == 1 {
        if record.units > 0 {
            xor_into(
                &mut action.snapshot_hash,
                &set_hash_leaf(&action_key, &owner, record.units),
            );
        }
        xor_into(
            &mut action.snapshot_hash,
            &set_hash_leaf(&action_key, &owner, total),
        );
    } else {
        action.snapshot_hash = snapshot_hash_step(&action.snapshot_hash, &owner, total);
    }
    if record.units == 0 {
        action.holders_snapshotted = action
            .holders_snapshotted
            .checked_add(1)
            .ok_or(QuponError::MathOverflow)?;
    }

    record.units = total;
    record.gross = e.gross;
    record.tax = e.tax;
    record.net = e.net;
    record.principal = e.principal;
    record.try_serialize(&mut &mut ent_info.try_borrow_mut_data()?[..])?;

    let clock = Clock::get()?;
    emit!(HolderSnapshotted {
        series: action.series,
        action: action_key,
        index: action.index,
        owner,
        bond_ata: position,
        units: total,
        gross: e.gross,
        tax: e.tax,
        net: e.net,
        principal: e.principal,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// `sha256(prev ‖ owner ‖ units_le)` — the off-chain reconciler recomputes it over investors sorted by owner
/// (hash_scheme 0, actions announced before plan 15).
pub fn snapshot_hash_step(prev: &[u8; 32], owner: &Pubkey, units: u64) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[prev, owner.as_ref(), &units.to_le_bytes()]).to_bytes()
}

fn action_kind(action: &CorporateAction) -> Result<Kind> {
    ActionKind::try_from(action.kind)?;
    Kind::from_code(action.kind, action.factor_bps).map_err(math_err)
}

#[derive(Accounts)]
pub struct FinalizeSnapshot<'info> {
    /// Anyone (pays the fee).
    pub authority: Signer<'info>,
    #[account(mut, has_one = mint)]
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
}

pub fn handle_finalize_snapshot(ctx: Context<FinalizeSnapshot>) -> Result<()> {
    let series = &ctx.accounts.series;
    let action = &ctx.accounts.action;
    require!(
        action.status == ActionStatus::RecordStruck as u8,
        QuponError::WrongStatus
    );
    let hooked = series.hook == 1;
    if hooked {
        // Completeness: every checkpoint in existence was either advanced by this snapshot or created after
        // `record_at` (it held nothing then). Holders' own burns after their snapshot can only make Σ exceed supply.
        require!(
            action
                .positions_done
                .checked_add(series.ckpt_late)
                .ok_or(QuponError::MathOverflow)?
                == series.ckpt_count,
            QuponError::PositionsIncomplete
        );
        require!(
            action.units_snapshotted >= ctx.accounts.mint.supply,
            QuponError::SupplyMismatch
        );
    } else {
        require!(
            mint_paused(&ctx.accounts.mint.to_account_info())?,
            QuponError::MintNotPaused
        );
        // Transfers are paused, so every unit is in some registered holder's ATA: nobody can be missed.
        require!(
            action.units_snapshotted == ctx.accounts.mint.supply,
            QuponError::SupplyMismatch
        );
    }
    require!(action.holders_snapshotted > 0, QuponError::NothingToDo);
    let kind = ActionKind::try_from(action.kind)?;
    let meeting = kind == ActionKind::Meeting;
    if !meeting {
        let dc = DayCount::try_from(series.day_count).map_err(math_err)?;
        let ok = entitlement::rounding_within_tolerance(
            action.total_gross,
            action.units_snapshotted,
            action.holders_snapshotted,
            series.face_value,
            action.rate_bps,
            dc,
            action.accrual_days,
        )
        .map_err(math_err)?;
        require!(ok, QuponError::RoundingDrift);
    }

    // Claims are fixed in Entitlement PDAs: coupons, partial calls and meetings trade ex-date from here on; full
    // redemptions keep the register frozen (paused, or locked by the gate) until paid and burned.
    let redemption = matches!(kind, ActionKind::Redemption | ActionKind::EarlyRedemption);
    if hooked {
        if !redemption {
            ctx.accounts.series.record_at = 0;
        }
    } else if !redemption {
        let mint = ctx.accounts.mint.key();
        let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
        pausable_resume(CpiContext::new_with_signer(
            ctx.accounts.bond_token_program.key(),
            PausableToggle {
                token_program_id: ctx.accounts.bond_token_program.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.series.to_account_info(),
            },
            &[seeds],
        ))?;
    }
    let action = &mut ctx.accounts.action;
    action.status = if meeting {
        ActionStatus::VotingOpen
    } else {
        ActionStatus::SnapshotComplete
    } as u8;
    let clock = Clock::get()?;
    action.finalize_delay =
        u32::try_from(clock.unix_timestamp.saturating_sub(action.record_at).max(0))
            .unwrap_or(u32::MAX);
    emit!(SnapshotFinalized {
        series: action.series,
        action: action.key(),
        index: action.index,
        units_snapshotted: action.units_snapshotted,
        holders_snapshotted: action.holders_snapshotted,
        total_gross: action.total_gross,
        total_tax: action.total_tax,
        total_net: action.total_net,
        snapshot_hash: action.snapshot_hash,
        status: action.status,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
