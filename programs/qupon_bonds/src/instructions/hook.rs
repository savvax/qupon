//! Record date by transfer-hook gate (plan 15 D1'): the bond mint's transfer hook is this program. After a pending
//! record's `record_at`, an owner's bonds move only once their position is snapshotted for that record, so every
//! snapshot equals the balance at `record_at` exactly — without pausing the mint and without relying on a crank to be
//! on time. Snapshot-then-transfer in one transaction makes the gate invisible to a trader.
use anchor_lang::prelude::*;
use anchor_spl::token_2022::spl_token_2022::{
    extension::{
        transfer_hook::{TransferHook, TransferHookAccount},
        BaseStateWithExtensions, StateWithExtensions,
    },
    state::{Account as TokenAccountState, Mint as MintState},
};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::instruction::ExecuteInstruction;

use crate::{
    constants::*,
    error::QuponError,
    state::{ActionKind, Checkpoint, Series},
    utils::create_pda_account,
};

/// Extra accounts Token-2022 passes to `execute` (indices 5..): series, source owner's and destination owner's
/// checkpoint. Owners come from bytes 32..64 of the token accounts (indices 0 and 2).
fn extra_metas() -> Result<[ExtraAccountMeta; 3]> {
    let ckpt = |token_account_index: u8| {
        ExtraAccountMeta::new_with_seeds(
            &[
                Seed::Literal {
                    bytes: CHECKPOINT_SEED.to_vec(),
                },
                Seed::AccountKey { index: 5 },
                Seed::AccountData {
                    account_index: token_account_index,
                    data_index: 32,
                    length: 32,
                },
            ],
            false,
            false,
        )
    };
    let series = ExtraAccountMeta::new_with_seeds(
        &[
            Seed::Literal {
                bytes: SERIES_SEED.to_vec(),
            },
            Seed::AccountKey { index: 1 },
        ],
        false,
        false,
    );
    match (series, ckpt(0), ckpt(2)) {
        (Ok(s), Ok(a), Ok(b)) => Ok([s, a, b]),
        _ => err!(QuponError::InvalidParams),
    }
}

#[derive(Accounts)]
pub struct InitHook<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(mut, has_one = registrar @ QuponError::Unauthorized, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: the series mint (`has_one`); its TransferHook extension is checked in the handler.
    pub mint: UncheckedAccount<'info>,
    /// CHECK: created here at the standard validation PDA of `mint`.
    #[account(mut, seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

/// Write the hook's validation account and switch the series to the hook gate (registrar, once).
pub fn handle_init_hook(ctx: Context<InitHook>) -> Result<()> {
    {
        let data = ctx.accounts.mint.try_borrow_data()?;
        let mint = StateWithExtensions::<MintState>::unpack(&data)
            .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
        let hook = mint
            .get_extension::<TransferHook>()
            .map_err(|_| error!(QuponError::InvalidMintExtensions))?;
        require!(
            Option::<Pubkey>::from(hook.program_id) == Some(crate::ID),
            QuponError::InvalidMintExtensions
        );
    }
    require!(ctx.accounts.series.hook == 0, QuponError::AlreadyProcessed);
    // Every position must get its checkpoint at registration, so the gate is armed before anybody holds units.
    require!(
        ctx.accounts.series.total_issued == 0 && ctx.accounts.series.ckpt_count == 0,
        QuponError::SupplyNotZero
    );

    let metas = extra_metas()?;
    let space = ExtraAccountMetaList::size_of(metas.len())
        .map_err(|_| error!(QuponError::InvalidParams))?;
    let mint = ctx.accounts.mint.key();
    create_pda_account(
        &ctx.accounts.registrar.to_account_info(),
        &ctx.accounts.extra_account_meta_list.to_account_info(),
        &ctx.accounts.system_program.to_account_info(),
        space,
        &[
            EXTRA_METAS_SEED,
            mint.as_ref(),
            &[ctx.bumps.extra_account_meta_list],
        ],
    )?;
    let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
    ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &metas)
        .map_err(|_| error!(QuponError::InvalidParams))?;
    ctx.accounts.series.hook = 1;
    Ok(())
}

/// Create `owner`'s checkpoint on a hooked series (registration, trade admission). A checkpoint created after the
/// pending record's `record_at` starts at its `record_seq`: the position is a frozen, freshly thawed ATA or escrow that
/// held nothing at `record_at`, and it is counted in `ckpt_late` so completeness still adds up.
pub fn create_checkpoint<'info>(
    payer: &AccountInfo<'info>,
    target: &AccountInfo<'info>,
    system_program: &AccountInfo<'info>,
    series: &mut Account<'info, Series>,
    owner: &Pubkey,
) -> Result<()> {
    let series_key = series.key();
    let (pda, bump) = Pubkey::find_program_address(
        &[CHECKPOINT_SEED, series_key.as_ref(), owner.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(target.key(), pda, QuponError::InvalidParams);
    if !target.data_is_empty() {
        return Ok(());
    }
    create_pda_account(
        payer,
        target,
        system_program,
        8 + Checkpoint::INIT_SPACE,
        &[
            CHECKPOINT_SEED,
            series_key.as_ref(),
            owner.as_ref(),
            &[bump],
        ],
    )?;
    let late = series.record_at != 0 && Clock::get()?.unix_timestamp >= series.record_at;
    let c = Checkpoint {
        bump,
        series: series_key,
        owner: *owner,
        last_seq: if late { series.record_seq } else { 0 },
    };
    c.try_serialize(&mut &mut target.try_borrow_mut_data()?[..])?;
    series.ckpt_count = series
        .ckpt_count
        .checked_add(1)
        .ok_or(QuponError::MathOverflow)?;
    if late {
        series.ckpt_late = series
            .ckpt_late
            .checked_add(1)
            .ok_or(QuponError::MathOverflow)?;
    }
    Ok(())
}

/// The gate itself, shared by `execute` and the program's own unit moves (Token-2022 would re-enter this program,
/// which Solana forbids, so those paths burn + mint and check here instead).
pub fn require_gate_open(
    series: &Account<Series>,
    src_owner: &Pubkey,
    src_ckpt: &AccountInfo,
    dst_owner: &Pubkey,
    dst_ckpt: &AccountInfo,
) -> Result<()> {
    if series.hook == 0 || series.record_at == 0 || Clock::get()?.unix_timestamp < series.record_at
    {
        return Ok(());
    }
    let kind = ActionKind::try_from(series.record_kind)?;
    require!(
        !matches!(kind, ActionKind::Redemption | ActionKind::EarlyRedemption),
        QuponError::RecordLocked
    );
    let key = series.key();
    require!(
        snapshotted(src_ckpt, &key, src_owner, series.record_seq)?
            && snapshotted(dst_ckpt, &key, dst_owner, series.record_seq)?,
        QuponError::HolderNotSnapshotted
    );
    Ok(())
}

/// Leaf of the order-independent snapshot hash (hash_scheme 1); XOR it in to add a holder, XOR again to remove it.
pub fn set_hash_leaf(action: &Pubkey, owner: &Pubkey, units: u64) -> [u8; 32] {
    solana_sha256_hasher::hashv(&[
        SNAP_HASH_DOMAIN,
        action.as_ref(),
        owner.as_ref(),
        &units.to_le_bytes(),
    ])
    .to_bytes()
}

pub fn xor_into(acc: &mut [u8; 32], leaf: &[u8; 32]) {
    for (a, l) in acc.iter_mut().zip(leaf) {
        *a ^= l;
    }
}

#[derive(Accounts)]
pub struct Execute<'info> {
    /// CHECK: Token-2022 account; its `transferring` flag is checked in the handler.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub source: UncheckedAccount<'info>,
    /// CHECK: the bond mint (the series below is seeded by it).
    pub mint: UncheckedAccount<'info>,
    /// CHECK: Token-2022 account.
    #[account(owner = anchor_spl::token_2022::ID)]
    pub destination: UncheckedAccount<'info>,
    /// CHECK: transfer authority; the gate does not depend on who signs.
    pub authority: UncheckedAccount<'info>,
    /// CHECK: this mint's validation account.
    #[account(seeds = [EXTRA_METAS_SEED, mint.key().as_ref()], bump)]
    pub extra_account_meta_list: UncheckedAccount<'info>,
    #[account(seeds = [SERIES_SEED, mint.key().as_ref()], bump = series.bump, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: checkpoint PDA of the source owner (may not exist) — re-derived in the handler.
    pub source_checkpoint: UncheckedAccount<'info>,
    /// CHECK: checkpoint PDA of the destination owner (may not exist) — re-derived in the handler.
    pub destination_checkpoint: UncheckedAccount<'info>,
}

pub fn handle_execute(ctx: Context<Execute>, _amount: u64) -> Result<()> {
    // Only inside a Token-2022 transfer: a direct call must never be mistaken for one.
    require!(
        token_account(&ctx.accounts.source, |a| {
            a.get_extension::<TransferHookAccount>()
                .is_ok_and(|e| bool::from(e.transferring))
        })?,
        QuponError::NotTransferring
    );
    let src_owner = token_account(&ctx.accounts.source, |a| a.base.owner)?;
    let dst_owner = token_account(&ctx.accounts.destination, |a| a.base.owner)?;
    require_gate_open(
        &ctx.accounts.series,
        &src_owner,
        &ctx.accounts.source_checkpoint,
        &dst_owner,
        &ctx.accounts.destination_checkpoint,
    )
}

fn token_account<T>(
    info: &AccountInfo,
    f: impl FnOnce(&StateWithExtensions<TokenAccountState>) -> T,
) -> Result<T> {
    let data = info.try_borrow_data()?;
    let state = StateWithExtensions::<TokenAccountState>::unpack(&data)
        .map_err(|_| error!(QuponError::AccountOwnerMismatch))?;
    Ok(f(&state))
}

/// `true` if `info` is the owner's checkpoint PDA and it already covers record `seq`.
pub fn snapshotted(info: &AccountInfo, series: &Pubkey, owner: &Pubkey, seq: u32) -> Result<bool> {
    let (pda, _) = Pubkey::find_program_address(
        &[CHECKPOINT_SEED, series.as_ref(), owner.as_ref()],
        &crate::ID,
    );
    require_keys_eq!(info.key(), pda, QuponError::InvalidParams);
    if info.owner != &crate::ID || info.data_is_empty() {
        return Ok(false);
    }
    let c = Checkpoint::try_deserialize(&mut &info.try_borrow_data()?[..])?;
    Ok(c.last_seq >= seq)
}
