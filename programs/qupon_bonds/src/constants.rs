use anchor_lang::prelude::pubkey;
use anchor_lang::prelude::Pubkey;
pub const SERIES_SEED: &[u8] = b"series";
pub const INVESTOR_SEED: &[u8] = b"investor";
pub const ACTION_SEED: &[u8] = b"action";
pub const ENTITLEMENT_SEED: &[u8] = b"entitlement";
pub const TRADE_SEED: &[u8] = b"trade";
pub const CHECKPOINT_SEED: &[u8] = b"ckpt";
/// Domain separator of the order-independent snapshot hash (hash_scheme 1).
pub const SNAP_HASH_DOMAIN: &[u8] = b"qupon:snap:v1";
/// Standard seed of the transfer-hook validation account (spl-transfer-hook-interface).
pub const EXTRA_METAS_SEED: &[u8] = b"extra-account-metas";

/// Asia/Almaty is UTC+5 all year; period boundaries are Almaty midnights (03-domain §1, §3).
pub const ALMATY_UTC_OFFSET_SECS: i64 = 5 * 3600;
pub const BPS_DENOMINATOR: u16 = 10_000;

/// Solana Attestation Service (devnet and mainnet) — KYC attestations (task 041, docs/04-stack.md).
pub const SAS_PROGRAM_ID: Pubkey = pubkey!("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG");
/// SAS credential `["credential", kyc_provider, "QUPON-KYC"]` of the demo KYC provider
/// (DcXPFyq5GxFc79RqM6xaWcAyrpty4KZJQJoNoEXwdNx9; the provider itself is SIMULATED — a devnet keypair, not a licensed firm).
pub const KYC_CREDENTIAL: Pubkey = pubkey!("AfxniTor9D16XEvGJh7fxyhJ6vws27zksvgJ54LDUYHz");
/// SAS schema `["schema", KYC_CREDENTIAL, "investor-kyc", [1]]`: investor_type u8, residency u8, tax_rate_bps u16.
pub const KYC_SCHEMA: Pubkey = pubkey!("8yyKDVaYH6X9AJkc5iJZLcCZa1idecp1HMWyztmfmKaD");

/// Solana DvP (solana-foundation/dvp v0.1.0; same id on devnet and mainnet) settles secondary trades. Qupon never
/// calls it: `admit_trade` only lets its bond escrow hold units (docs/03-domain.md §4a).
pub const DVP_PROGRAM_ID: Pubkey = pubkey!("dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq");
