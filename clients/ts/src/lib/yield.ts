/**
 * Yield math for the bond dossier: dirty price, current yield and yield to
 * maturity on the street convention (semi-annual or other frequency
 * compounding, settlement on the civil coupon schedule, exponents offset by
 * the day-count fraction of the current period). Prices are per unit, in
 * minor units, matching `fixtures/entitlement.json` `yield_cases`.
 */
import {
	type DayCount,
	type Ymd,
	accrualDays,
	addMonths,
	compareYmd,
} from "./daycount.js";
import { accruedSigned } from "./accrued.js";

/** Clean + accrued, per unit, in minor units. */
export function dirtyPrice(
	cleanPerUnit: bigint,
	accruedPerUnit: bigint,
): bigint {
	return cleanPerUnit + accruedPerUnit;
}

/** Annual coupon cash over the clean price, as a fraction (100% = 1). */
export function currentYield(
	rateBps: number,
	face: bigint,
	cleanPrice: bigint,
): number {
	if (cleanPrice <= 0n) throw new RangeError("cleanPrice must be positive");
	return Number(face * BigInt(rateBps)) / (Number(cleanPrice) * 10_000);
}

/** Inputs to {@link ytm}; all prices per unit in minor units. */
export interface YtmParams {
	/** Clean price per unit (the quoted price). */
	cleanPrice: bigint;
	/** Face value per unit. */
	face: bigint;
	/** Coupon rate in basis points. */
	rateBps: number;
	/** Coupons per year (2 = semi-annual). */
	frequency: number;
	/** Settlement date. */
	settle: Ymd;
	/** Maturity date (a coupon date). */
	maturity: Ymd;
	/** Day count convention of the accrual fraction. */
	dayCount: DayCount;
}

/** Newton–Raphson convergence: |Δy| tolerance and iteration cap. */
const YTM_TOL = 1e-10;
const YTM_MAX_ITER = 100;

/** One period's coupon and the discount factor exponents, in floats. */
function cashflows(p: YtmParams): {
	coupon: number;
	n: number;
	w: number;
	prev: Ymd;
	face: number;
} {
	if (
		p.frequency < 1 ||
		!Number.isInteger(p.frequency) ||
		!Number.isInteger(12 / p.frequency)
	) {
		throw new RangeError("frequency must divide 12 (e.g. 1, 2, 3, 4, 6)");
	}
	if (compareYmd(p.settle, p.maturity) >= 0) {
		throw new RangeError("settle must precede maturity");
	}
	const step = 12 / p.frequency;
	// Walk the schedule back from maturity until the previous coupon date is ≤ settle.
	let next = p.maturity;
	let n = 1;
	while (compareYmd(addMonths(next, -step), p.settle) > 0) {
		next = addMonths(next, -step);
		n++;
	}
	const prev = addMonths(next, -step);
	// Street convention: fraction of the current period still to run.
	const w =
		accrualDays(p.dayCount, p.settle, next) /
		accrualDays(p.dayCount, prev, next);
	return {
		coupon: Number(p.face * BigInt(p.rateBps)) / 10_000 / p.frequency,
		n,
		w,
		prev,
		face: Number(p.face),
	};
}

/**
 * Yield to maturity as an annual fraction. Newton–Raphson on the
 * street-convention dirty price, tolerance 1e-10, ≤ 100 iterations,
 * safeguarded by a bisection bracket so it always converges.
 */
export function ytm(p: YtmParams): number {
	const cf = cashflows(p);
	const target =
		Number(p.cleanPrice) +
		Number(
			accruedSigned(1n, p.face, p.rateBps, p.dayCount, cf.prev, p.settle)
				.amount,
		);

	const price = (y: number): number => {
		const v = 1 / (1 + y / p.frequency);
		let a = 0; // Σ coupon·v^k, k = 0..n-1
		for (let k = 0; k < cf.n; k++) a += cf.coupon * v ** k;
		return v ** cf.w * (a + cf.face * v ** (cf.n - 1));
	};
	const f = (y: number): number => price(y) - target;

	// Bracket: price is strictly decreasing in y over y > -frequency.
	let lo = -p.frequency + 1e-9;
	let hi = 100;
	if (f(lo) < 0 || f(hi) > 0)
		throw new RangeError("price outside the solvable range");
	let y = p.rateBps / 10_000; // coupon rate: exact for a par bond
	for (let i = 0; i < YTM_MAX_ITER; i++) {
		const h = 1e-7;
		const d = (f(y + h) - f(y - h)) / (2 * h); // central-difference derivative
		let next = Number.isFinite(d) && d !== 0 ? y - f(y) / d : (lo + hi) / 2;
		if (!(next > lo && next < hi)) next = (lo + hi) / 2; // NR stepped out: bisect
		if (f(y) > 0) lo = y;
		else hi = y;
		if (Math.abs(next - y) < YTM_TOL) return next;
		y = next;
	}
	throw new RangeError("ytm did not converge");
}
