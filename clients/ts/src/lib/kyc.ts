/**
 * KYC via the Solana Attestation Service (task 041). The program only registers an investor whose wallet holds a
 * live attestation from the demo KYC provider under these credential/schema addresses (constants.rs mirrors them).
 * The provider is SIMULATED (a devnet keypair, not a licensed KYC firm); the attestation itself is real SAS.
 */
import { type Address, type ReadonlyUint8Array, address, getAddressEncoder } from "@solana/kit";
import { deriveAttestationPda, deriveCredentialPda, deriveSchemaPda } from "sas-lib";

export const KYC_PROVIDER = address("DcXPFyq5GxFc79RqM6xaWcAyrpty4KZJQJoNoEXwdNx9");
export const KYC_CREDENTIAL_NAME = "QUPON-KYC";
export const KYC_SCHEMA_NAME = "investor-kyc";
export const KYC_CREDENTIAL = address("AfxniTor9D16XEvGJh7fxyhJ6vws27zksvgJ54LDUYHz");
export const KYC_SCHEMA = address("8yyKDVaYH6X9AJkc5iJZLcCZa1idecp1HMWyztmfmKaD");
/** SAS layout codes: investor_type U8 (0), residency U8 (0), tax_rate_bps U16 (1). */
export const KYC_SCHEMA_LAYOUT = new Uint8Array([0, 0, 1]);
export const KYC_SCHEMA_FIELDS = ["investor_type", "residency", "tax_rate_bps"];

export interface KycAttributes {
	investorType: number; // 0 individual, 1 legal entity
	residency: number; // 0 resident, 1 non-resident
	taxRateBps: number;
}

/** Attestation data in schema order (borsh: u8, u8, u16 LE) — what the program compares with the registration. */
export function encodeKycData(k: KycAttributes): Uint8Array {
	return new Uint8Array([k.investorType, k.residency, k.taxRateBps & 0xff, (k.taxRateBps >> 8) & 0xff]);
}

/** Bytewise equality of two encoded KYC attribute blobs (the attestation vs the registration). */
export function kycDataEquals(a: ReadonlyUint8Array, b: ReadonlyUint8Array): boolean {
	return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** The investor's attestation: nonce = the investor's wallet, so one attestation per wallet. */
export async function kycAttestationPda(owner: Address): Promise<Address> {
	const [pda] = await deriveAttestationPda({ credential: KYC_CREDENTIAL, schema: KYC_SCHEMA, nonce: owner });
	return pda;
}

/** `kyc_ref` stored on the Investor record = the attestation address. */
export async function kycRef(owner: Address): Promise<Uint8Array> {
	return new Uint8Array(getAddressEncoder().encode(await kycAttestationPda(owner)));
}

/** Re-derive the constants from the provider (used by the test that keeps them in sync with constants.rs). */
export async function deriveKycAddresses(provider: Address): Promise<{ credential: Address; schema: Address }> {
	const [credential] = await deriveCredentialPda({ authority: provider, name: KYC_CREDENTIAL_NAME });
	const [schema] = await deriveSchemaPda({ credential, name: KYC_SCHEMA_NAME, version: 1 });
	return { credential, schema };
}
