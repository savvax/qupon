import { type Address, getAddressEncoder, getProgramDerivedAddress, getU32Encoder } from "@solana/kit";
import { QUPON_BONDS_PROGRAM_ADDRESS } from "../generated/index.js";

/**
 * PDA helpers for the qupon_bonds program (seeds fixed by docs/02-architecture.md).
 * The generated client exposes finders for Series/Investor; Action and Entitlement
 * live here until Codama renders them (program accounts exist, IDL PDAs pending).
 */

/** Seed bytes — addresses are base58-decoded before use (never UTF-8 encoded). */
const enc = new TextEncoder();
const SERIES_SEED = enc.encode("series");
const INVESTOR_SEED = enc.encode("investor");
const ACTION_SEED = enc.encode("action");
const ENTITLEMENT_SEED = enc.encode("entitlement");
const ROUTE_SEED = enc.encode("route");

/** Series — seeds ["series", mint]. */
export async function seriesPda(mint: Address, programId: Address = QUPON_BONDS_PROGRAM_ADDRESS): Promise<Address> {
	return (await getProgramDerivedAddress({ programAddress: programId, seeds: [SERIES_SEED, getAddressEncoder().encode(mint)] }))[0];
}

/** Investor — seeds ["investor", series, owner]. */
export async function investorPda(
	series: Address,
	owner: Address,
	programId: Address = QUPON_BONDS_PROGRAM_ADDRESS,
): Promise<Address> {
	return (
		await getProgramDerivedAddress({
			programAddress: programId,
			seeds: [INVESTOR_SEED, getAddressEncoder().encode(series), getAddressEncoder().encode(owner)],
		})
	)[0];
}

/** CorporateAction — seeds ["action", series, action_index u32 LE]. */
export async function actionPda(
	series: Address,
	actionIndex: number,
	programId: Address = QUPON_BONDS_PROGRAM_ADDRESS,
): Promise<Address> {
	return (
		await getProgramDerivedAddress({
			programAddress: programId,
			seeds: [ACTION_SEED, getAddressEncoder().encode(series), getU32Encoder().encode(actionIndex)],
		})
	)[0];
}

/** Entitlement — seeds ["entitlement", action, owner]. */
export async function entitlementPda(
	action: Address,
	owner: Address,
	programId: Address = QUPON_BONDS_PROGRAM_ADDRESS,
): Promise<Address> {
	return (
		await getProgramDerivedAddress({
			programAddress: programId,
			seeds: [ENTITLEMENT_SEED, getAddressEncoder().encode(action), getAddressEncoder().encode(owner)],
		})
	)[0];
}

/** Holder-chosen payout route — seeds ["route", investor] (plan 15 D6; pay_batch reads it, may be uninitialised). */
export async function routePda(investor: Address, programId: Address = QUPON_BONDS_PROGRAM_ADDRESS): Promise<Address> {
	return (await getProgramDerivedAddress({ programAddress: programId, seeds: [ROUTE_SEED, getAddressEncoder().encode(investor)] }))[0];
}
