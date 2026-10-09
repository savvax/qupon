/**
 * Signed accrued interest mirroring `crates/entitlement` `accrued_signed`
 * (docs/03-domain.md §2): positive while settling after the period start,
 * negative in the ex-coupon window (settle before start); half-up on the
 * magnitude, once per position — never per unit then multiplied.
 * Vectors: fixtures/entitlement.json `accrued_cases`.
 */
import {
	DayCount,
	type Ymd,
	MathError,
	accrualDays,
	basis,
	compareYmd,
} from "./daycount.js";
import { BPS, roundHalfUp } from "./entitlement.js";

/** i64::MAX — the crate returns the amount as i64. */
const I64_MAX = (1n << 63n) - 1n;

/** Accrued interest result: amount in minor units (signed), accrual days (signed). */
export interface Accrued {
	readonly amount: bigint;
	readonly days: number;
}

/** Accrued interest for `units` of face `face` at `rateBps` from `start` to `settle`. */
export function accruedSigned(
	units: bigint,
	face: bigint,
	rateBps: number,
	dayCount: DayCount,
	start: Ymd,
	settle: Ymd,
): Accrued {
	if (units < 0n || face < 0n)
		throw new MathError("Overflow", "negative input");
	const [a, b, sign] =
		compareYmd(settle, start) >= 0 ? [start, settle, 1n] : [settle, start, -1n];
	const days = compareYmd(a, b) === 0 ? 0 : accrualDays(dayCount, a, b);
	const num = units * face * BigInt(rateBps) * BigInt(days);
	const amount = roundHalfUp(num, BPS * BigInt(basis(dayCount)));
	if (amount > I64_MAX) throw new MathError("Overflow", `${amount}`);
	if (days > 2_147_483_647) throw new MathError("Overflow", `days=${days}`);
	return { amount: sign * amount, days: Number(sign) * days };
}
