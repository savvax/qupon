use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::Token2022,
    token_interface::{
        freeze_account, thaw_account, FreezeAccount, Mint, ThawAccount, TokenAccount,
        TokenInterface,
    },
};

use crate::{
    constants::*,
    error::QuponError,
    events::{InvestorRegistered, InvestorStatusChanged},
    state::{InvestorStatus, InvestorType, Residency, Series, SeriesStatus},
    Investor,
};

/// KYC attributes; they must equal the KYC provider's SAS attestation for this wallet (`kyc_attestation`).
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct KycParams {
    pub investor_type: u8,
    pub residency: u8,
    pub tax_rate_bps: u16,
    /// Address of the SAS attestation the registration relies on.
    pub kyc_ref: [u8; 32],
}

/// SAS Attestation account (pinocchio layout, solana-attestation-service `state/attestation.rs`): disc u8 = 2,
/// nonce, credential, schema (32 each), data (u32 len + bytes), signer 32, expiry i64 (0 = never), token_account 32.
const SAS_ATTESTATION_DISC: u8 = 2;
const KYC_DATA_LEN: usize = 4; // investor_type u8 · residency u8 · tax_rate_bps u16 (schema KYC_SCHEMA)

/// The investor's KYC must be attested by the KYC provider: the account is a live SAS attestation (closed =
/// revoked, so ownership is checked) under our credential and schema, issued for this wallet, not expired, and its
/// attributes equal the ones being registered. SAS itself only lets the credential's authorized signers create it.
pub fn verify_kyc_attestation(
    att: &AccountInfo,
    owner: &Pubkey,
    kyc: &KycParams,
    now: i64,
) -> Result<()> {
    let bad = || error!(QuponError::KycAttestationInvalid);
    if *att.owner != SAS_PROGRAM_ID || att.key().to_bytes() != kyc.kyc_ref {
        return Err(bad());
    }
    let d = att.try_borrow_data()?;
    let tail = 101 + KYC_DATA_LEN; // signer starts here
    if d.len() < tail + 32 + 8 || d[0] != SAS_ATTESTATION_DISC {
        return Err(bad());
    }
    let key = |r: core::ops::Range<usize>| Pubkey::try_from(&d[r]).map_err(|_| bad());
    let data_len = u32::from_le_bytes(d[97..101].try_into().map_err(|_| bad())?) as usize;
    if key(1..33)? != *owner
        || key(33..65)? != KYC_CREDENTIAL
        || key(65..97)? != KYC_SCHEMA
        || data_len != KYC_DATA_LEN
    {
        return Err(bad());
    }
    let tax = u16::from_le_bytes([d[103], d[104]]);
    if d[101] != kyc.investor_type || d[102] != kyc.residency || tax != kyc.tax_rate_bps {
        return Err(bad());
    }
    let expiry = i64::from_le_bytes(d[tail + 32..tail + 40].try_into().map_err(|_| bad())?);
    if expiry != 0 && expiry <= now {
        return Err(bad());
    }
    Ok(())
}

#[derive(Accounts)]
pub struct RegisterInvestor<'info> {
    #[account(mut)]
    pub registrar: Signer<'info>,
    #[account(
        mut,
        has_one = registrar @ QuponError::Unauthorized,
        has_one = mint,
        has_one = cash_mint,
        constraint = series.status == SeriesStatus::Active as u8 @ QuponError::SeriesNotActive
    )]
    pub series: Box<Account<'info, Series>>,
    /// CHECK: the investor's wallet; any system account can be registered.
    pub owner: UncheckedAccount<'info>,
    /// CHECK: SAS attestation of the investor's KYC, verified by `verify_kyc_attestation`.
    pub kyc_attestation: UncheckedAccount<'info>,
    #[account(
        init,
        payer = registrar,
        space = 8 + Investor::INIT_SPACE,
        seeds = [INVESTOR_SEED, series.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub investor: Box<Account<'info, Investor>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = registrar,
        associated_token::mint = mint,
        associated_token::authority = owner,
        associated_token::token_program = bond_token_program
    )]
    pub bond_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub cash_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed,
        payer = registrar,
        associated_token::mint = cash_mint,
        associated_token::authority = owner,
        associated_token::token_program = cash_token_program
    )]
    pub cash_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
    pub cash_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    /// CHECK: hooked series: the owner's record-date checkpoint, created here (unused on legacy series).
    #[account(mut, seeds = [CHECKPOINT_SEED, series.key().as_ref(), owner.key().as_ref()], bump)]
    pub checkpoint: UncheckedAccount<'info>,
}

pub fn handle_register_investor(ctx: Context<RegisterInvestor>, kyc: KycParams) -> Result<()> {
    InvestorType::try_from(kyc.investor_type)?;
    Residency::try_from(kyc.residency)?;
    require!(
        kyc.tax_rate_bps <= BPS_DENOMINATOR,
        QuponError::InvalidParams
    );
    let clock = Clock::get()?;
    verify_kyc_attestation(
        &ctx.accounts.kyc_attestation,
        &ctx.accounts.owner.key(),
        &kyc,
        clock.unix_timestamp,
    )?;
    if ctx.accounts.series.hook == 1 {
        let owner = ctx.accounts.owner.key();
        crate::instructions::hook::create_checkpoint(
            &ctx.accounts.registrar.to_account_info(),
            &ctx.accounts.checkpoint.to_account_info(),
            &ctx.accounts.system_program.to_account_info(),
            &mut ctx.accounts.series,
            &owner,
        )?;
    }

    // DefaultAccountState=Frozen: the new ATA is frozen; only the series PDA (freeze authority) can thaw it.
    if ctx.accounts.bond_ata.is_frozen() {
        let mint = ctx.accounts.mint.key();
        let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
        thaw_account(CpiContext::new_with_signer(
            ctx.accounts.bond_token_program.key(),
            ThawAccount {
                account: ctx.accounts.bond_ata.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                authority: ctx.accounts.series.to_account_info(),
            },
            &[seeds],
        ))?;
    }

    let inv = &mut ctx.accounts.investor;
    inv.bump = ctx.bumps.investor;
    inv.series = ctx.accounts.series.key();
    inv.owner = ctx.accounts.owner.key();
    inv.bond_ata = ctx.accounts.bond_ata.key();
    inv.cash_ata = ctx.accounts.cash_ata.key();
    inv.investor_type = kyc.investor_type;
    inv.residency = kyc.residency;
    inv.tax_rate_bps = kyc.tax_rate_bps;
    inv.status = InvestorStatus::Active as u8;
    inv.kyc_ref = kyc.kyc_ref;
    inv.registered_at = clock.unix_timestamp;

    emit!(InvestorRegistered {
        series: inv.series,
        investor: inv.key(),
        owner: inv.owner,
        bond_ata: inv.bond_ata,
        cash_ata: inv.cash_ata,
        investor_type: inv.investor_type,
        residency: inv.residency,
        tax_rate_bps: inv.tax_rate_bps,
        kyc_ref: inv.kyc_ref,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}

/// Shared by `suspend_investor` and `reinstate_investor`.
#[derive(Accounts)]
pub struct SetInvestorStatus<'info> {
    pub registrar: Signer<'info>,
    #[account(has_one = registrar @ QuponError::Unauthorized, has_one = mint)]
    pub series: Box<Account<'info, Series>>,
    #[account(
        mut,
        seeds = [INVESTOR_SEED, series.key().as_ref(), investor.owner.as_ref()],
        bump = investor.bump,
        has_one = series,
        has_one = bond_ata
    )]
    pub investor: Box<Account<'info, Investor>>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(mut)]
    pub bond_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    pub bond_token_program: Program<'info, Token2022>,
}

pub fn handle_set_investor_status(ctx: Context<SetInvestorStatus>, suspend: bool) -> Result<()> {
    let (from, to) = if suspend {
        (InvestorStatus::Active, InvestorStatus::Suspended)
    } else {
        (InvestorStatus::Suspended, InvestorStatus::Active)
    };
    // A bond account its owner closed and recreated comes back frozen (DefaultAccountState) while the investor is
    // still Active: `reinstate_investor` thaws it again, and `suspend_investor` must not trip over the frozen account.
    let frozen = ctx.accounts.bond_ata.is_frozen();
    let rethaw = !suspend && frozen && ctx.accounts.investor.status == to as u8;
    require!(
        rethaw || ctx.accounts.investor.status == from as u8,
        if suspend {
            QuponError::InvestorSuspended
        } else {
            QuponError::InvestorNotActive
        }
    );

    let mint = ctx.accounts.mint.key();
    let seeds: &[&[u8]] = &[SERIES_SEED, mint.as_ref(), &[ctx.accounts.series.bump]];
    let program = ctx.accounts.bond_token_program.key();
    let account = ctx.accounts.bond_ata.to_account_info();
    let mint_info = ctx.accounts.mint.to_account_info();
    let authority = ctx.accounts.series.to_account_info();
    if suspend {
        if !frozen {
            freeze_account(CpiContext::new_with_signer(
                program,
                FreezeAccount {
                    account,
                    mint: mint_info,
                    authority,
                },
                &[seeds],
            ))?;
        }
    } else if frozen {
        thaw_account(CpiContext::new_with_signer(
            program,
            ThawAccount {
                account,
                mint: mint_info,
                authority,
            },
            &[seeds],
        ))?;
    }

    let inv = &mut ctx.accounts.investor;
    inv.status = to as u8;
    let clock = Clock::get()?;
    emit!(InvestorStatusChanged {
        series: inv.series,
        investor: inv.key(),
        owner: inv.owner,
        status: inv.status,
        slot: clock.slot,
        timestamp: clock.unix_timestamp,
    });
    Ok(())
}
