import { type Address, type Instruction, type KeyPairSigner, type TransactionSigner } from "@solana/kit";
import { getCreateAccountInstruction } from "@solana-program/system";
import {
	AccountState,
	AuthorityType,
	TOKEN_2022_PROGRAM_ADDRESS,
	type ExtensionArgs,
	getInitializeDefaultAccountStateInstruction,
	getInitializeMetadataPointerInstruction,
	getInitializeMint2Instruction,
	getInitializeMintCloseAuthorityInstruction,
	getInitializePausableConfigInstruction,
	getInitializePermanentDelegateInstruction,
	getInitializeTokenMetadataInstruction,
	getInitializeTransferHookInstruction,
	getMintSize,
	getSetAuthorityInstruction,
	getUpdateTokenMetadataFieldInstruction,
} from "@solana-program/token-2022";
import { QUPON_BONDS_PROGRAM_ADDRESS } from "../generated/index.js";
import type { QuponSeriesConfig } from "./config.js";
import { fromUnixUtc, ymd, type Ymd } from "./daycount.js";

/**
 * Bond mint creation (Token-2022) — the client-side half of docs/02-architecture.md
 * "Creation sequence". Anchor 1.2 has no init constraints for these extensions, so
 * `init_series` only *validates* the mint this module produces.
 *
 * Metadata update authority = registrar (recommended by the architecture doc): the
 * series PDA cannot sign client-side, and `apply_terms_change`/`close_series` require
 * the registrar signer for metadata CPIs anyway.
 */

/** Extra bytes funded on top of the mint for the TokenMetadata realloc (matches the Rust test helper). */
export const METADATA_RESERVE_BYTES = 512;

/** Fixed extensions every bond mint carries (TokenMetadata is variable-length and funded via the reserve). */
export function bondMintExtensions(series: Address, registrar: Address): ExtensionArgs[] {
	return [
		// pointer address only matters on-chain (set to the mint itself in the instruction builder)
		{ __kind: "MetadataPointer", authority: registrar, metadataAddress: null },
		{ __kind: "PermanentDelegate", delegate: series },
		{ __kind: "PausableConfig", authority: series, paused: false },
		{ __kind: "MintCloseAuthority", closeAuthority: series },
		{ __kind: "DefaultAccountState", state: AccountState.Frozen },
		// plan 15 D1': this program is the transfer hook — the record date is a gate, not a pause.
		// Only the series PDA could re-point it (authority = series).
		{ __kind: "TransferHook", authority: series, programId: QUPON_BONDS_PROGRAM_ADDRESS },
	];
}

/** Account size for the fixed extension set (deterministic; order-independent). */
export function bondMintSize(series: Address, registrar: Address): number {
	return getMintSize(bondMintExtensions(series, registrar));
}

/** The additional-metadata fields written after InitializeTokenMetadata. */
export interface MetadataField {
	readonly field: string;
	readonly value: string;
}

/** Almaty is a fixed UTC+05:00 — no DST, so a constant offset is exact. */
const ALMATY_OFFSET_SECS = 5 * 3600;

/** Civil Almaty date `termYears` years later (Feb 29 clamps to Feb 28). */
export function maturityYmd(nowUnixSec: number, termYears: number): Ymd {
	const today = fromUnixUtc(nowUnixSec + ALMATY_OFFSET_SECS);
	const y = today.y + termYears;
	try {
		return ymd(y, today.m, today.d);
	} catch {
		return ymd(y, 2, 28);
	}
}

/** Metadata fields for a series config entry (docs/02-architecture.md "Token-2022 bond mint"). */
export function bondMetadataFields(cfg: QuponSeriesConfig, nowUnixSec: number): MetadataField[] {
	const maturity = maturityYmd(nowUnixSec, cfg.termYears);
	return [
		{ field: "isin", value: cfg.isin },
		{ field: "face_value", value: String(cfg.faceValue) },
		{ field: "coupon_rate_bps", value: String(cfg.couponRateBps) },
		{ field: "frequency", value: String(cfg.frequency) },
		{ field: "day_count", value: cfg.dayCount },
		{ field: "maturity", value: `${maturity.y}-${String(maturity.m).padStart(2, "0")}-${String(maturity.d).padStart(2, "0")}` },
		{ field: "status", value: "ACTIVE" },
	];
}

/** First transaction: create the account, initialize every extension and the mint, hand off to the series PDA. */
export function buildCreateBondMintInstructions(params: {
	/** Registrar pays and is the temporary mint authority. */
	registrar: TransactionSigner;
	mint: KeyPairSigner;
	series: Address;
	lamports: bigint;
	name: string;
	symbol: string;
	uri: string;
}): Instruction[] {
	const { mint, series, registrar, lamports } = params;
	const m = mint.address;
	return [
		getCreateAccountInstruction({
			payer: registrar,
			newAccount: mint,
			lamports,
			space: bondMintSize(series, registrar.address),
			programAddress: TOKEN_2022_PROGRAM_ADDRESS,
		}),
		getInitializeMetadataPointerInstruction({ mint: m, authority: registrar.address, metadataAddress: m }),
		getInitializePermanentDelegateInstruction({ mint: m, delegate: series }),
		getInitializePausableConfigInstruction({ mint: m, authority: series }),
		getInitializeMintCloseAuthorityInstruction({ mint: m, closeAuthority: series }),
		getInitializeDefaultAccountStateInstruction({ mint: m, state: AccountState.Frozen }),
		// the hook gate (plan 15 D1'): armed by `init_hook` right after init_series
		getInitializeTransferHookInstruction({ mint: m, authority: series, programId: QUPON_BONDS_PROGRAM_ADDRESS }),
		// Temporary mint authority = registrar so it can sign InitializeTokenMetadata…
		getInitializeMint2Instruction({ mint: m, decimals: 0, mintAuthority: registrar.address, freezeAuthority: series }),
		getInitializeTokenMetadataInstruction({
			metadata: m,
			updateAuthority: registrar.address, // kept: metadata updates need the registrar signer (see header)
			mint: m,
			mintAuthority: registrar,
			name: params.name,
			symbol: params.symbol,
			uri: params.uri,
		}),
		// …then the series PDA takes over as mint authority.
		getSetAuthorityInstruction({
			owned: m,
			owner: registrar,
			authorityType: AuthorityType.MintTokens,
			newAuthority: series,
		}),
	];
}

/** Second transaction: write the additional metadata fields (registrar = update authority signs). */
export function buildMetadataFieldInstructions(params: {
	mint: Address;
	registrar: TransactionSigner;
	fields: readonly MetadataField[];
}): Instruction[] {
	return params.fields.map(f =>
		getUpdateTokenMetadataFieldInstruction({
			metadata: params.mint,
			updateAuthority: params.registrar,
			field: { __kind: "Key", fields: [f.field] },
			value: f.value,
		}),
	);
}
