/**
 * Entitlement math mirroring `crates/entitlement/src/lib.rs`
 * (rules: docs/03-domain.md §2). Amounts are bigint minor units; rounding is
 * half-up per holder, never per unit then multiplied.
 */
import { type DayCount, MathError, basis } from "./daycount.js";

/** Basis points denominator (100% = 10_000 bps). */
export const BPS = 10_000n;

/** `num / den` rounded half-up (ties away from zero). `den` must be positive. */
export function roundHalfUp(num: bigint, den: bigint): bigint {
	if (den <= 0n) throw new RangeError("den must be positive");
	const q = num / den;
	return num % den * 2n >= den ? q + 1n : q;
}

/** Corporate action kind; codes match `CorporateAction.kind` on-chain. */
export enum Kind {
	/** INTR — coupon payment. */
	Interest = 0,
	/** REDM — redemption at maturity (principal + final coupon). */
	Redemption = 1,
	/** MCAL — full early redemption (principal + accrued coupon). */
	EarlyRedemption = 2,
	/** PCAL — partial redemption of `factorBps` of face (plus coupon). */
	PartialRedemption = 3,
	/** BMET — bondholder meeting (no cash). */
	Meeting = 4,
	/** CHAN — terms change (no cash). */
	TermsChange = 5,
}

/** Decode the on-chain `kind` code (`factorBps` is used only for PCAL, code 3). */
export function kindFromCode(code: number): Kind {
	if (code >= Kind.Interest && code <= Kind.TermsChange) return code;
	throw new MathError("InvalidCode");
}

/** One holder's entitlement in minor units of the settlement currency. */
export interface Entitlement {
	/** Coupon before tax. */
	readonly gross: bigint;
	/** Withheld tax (goes to the tax vault). */
	readonly tax: bigint;
	/** `gross - tax`. */
	readonly net: bigint;
	/** Principal repaid (0 for coupons). */
	readonly principal: bigint;
}

/** Inputs to {@link computeEntitlement}; all values non-negative integers. */
export interface EntitlementInput {
	/** Bond units held at the record date. */
	units: bigint;
	/** Face value in minor units. */
	face: bigint;
	/** Coupon rate in basis points. */
	rateBps: number;
	/** Day count convention. */
	dayCount: DayCount;
	/** Accrual days (`accrualDays` output). */
	days: number;
	/** Withholding tax in basis points (≤ 10_000). */
	taxBps: number;
	/** Corporate action kind. */
	kind: Kind;
	/** Share of face redeemed, in bps (10_000 = full); PCAL only. */
	factorBps?: number;
}

function assertNonNegative(name: string, v: bigint | number | undefined): void {
	if (v === undefined) return;
	if (typeof v === "bigint" ? v < 0n : !Number.isInteger(v) || v < 0) {
		throw new MathError("Overflow", `${name}=${String(v)}`);
	}
}

/** u64::MAX — Rust-side inputs and Entitlement fields are u64. */
const U64_MAX = (1n << 64n) - 1n;

/** Mirrors Rust u64 inputs/outputs: reject values that would not fit. */
function assertU64(name: string, v: bigint): void {
	if (v < 0n || v > U64_MAX) {
		throw new MathError("Overflow", `${name}=${String(v)}`);
	}
}
/** Per-holder entitlement (§2), bigint throughout. */
export function computeEntitlement(input: EntitlementInput): Entitlement {
	assertNonNegative("units", input.units);
	assertNonNegative("face", input.face);
	assertNonNegative("rateBps", input.rateBps);
	assertNonNegative("days", input.days);
	assertNonNegative("taxBps", input.taxBps);
	assertNonNegative("factorBps", input.factorBps);
	assertU64("units", input.units);
	assertU64("face", input.face);

	const den = BPS * BigInt(basis(input.dayCount));
	const perUnitNum = input.face * BigInt(input.rateBps) * BigInt(input.days);
	const gross = roundHalfUp(perUnitNum * input.units, den);
	const tax = roundHalfUp(gross * BigInt(input.taxBps), BPS);
	const net = gross - tax;
	if (net < 0n) throw new MathError("Overflow", `net=${net}`); // mirrors checked_sub
	const full = input.units * input.face;
	assertU64("gross", gross);
	assertU64("tax", tax);
	assertU64("net", net);
	let principal = 0n;
	if (input.kind === Kind.Redemption || input.kind === Kind.EarlyRedemption) {
		principal = full;
	} else if (input.kind === Kind.PartialRedemption) {
		principal = roundHalfUp(full * BigInt(input.factorBps ?? 0), BPS);
	}
	assertU64("principal", principal);
	return { gross, tax, net, principal };
}

/**
 * Rounding-drift check for `finalize_snapshot`: true iff
 * `|Σ gross − supply × exact per-unit coupon| ≤ holders / 2` (compared against
 * the exact fraction, not the rounded per-unit value). Mirrors `rounding_within_tolerance`.
 */
export function roundingWithinTolerance(params: {
	sumGross: bigint;
	supply: bigint;
	holders: number;
	face: bigint;
	rateBps: number;
	dayCount: DayCount;
	days: number;
}): boolean {
	const den = BPS * BigInt(basis(params.dayCount));
	const exact =
		params.face * BigInt(params.rateBps) * BigInt(params.days) * params.supply;
	const paid = params.sumGross * den;
	const drift2 = (paid > exact ? paid - exact : exact - paid) * 2n;
	return drift2 <= BigInt(params.holders) * den;
}
