/**
 * Day-count and civil-date math mirroring `crates/entitlement/src/lib.rs`
 * (rules: docs/03-domain.md §3). Pure integer arithmetic, no dates-as-Date.
 */

/** Error codes matching the Rust crate's `Error` enum. */
export type MathErrorCode =
	| "Overflow"
	| "UnsupportedDayCount"
	| "InvalidDate"
	| "InvalidPeriod"
	| "InvalidCode";

/** Math error carrying the Rust-crate code so callers can map it to program errors. */
export class MathError extends Error {
	/** Crate error code. */
	readonly code: MathErrorCode;

	constructor(code: MathErrorCode, message?: string) {
		super(`${code}${message ? `: ${message}` : ""}`);
		this.name = "MathError";
		this.code = code;
	}
}

/** Day count convention; codes match `Series.day_count` on-chain. */
export enum DayCount {
	/** 30E/360 (default), basis 360. */
	Thirty360 = 0,
	/** ACT/ACT — reserved, rejected with `UnsupportedDayCount`. */
	ActAct = 1,
	/** Actual days / 365, basis 365. */
	Act365 = 2,
}

/** Decode the on-chain `day_count` code. */
export function dayCountFromCode(code: number): DayCount {
	if (code === DayCount.Thirty360 || code === DayCount.ActAct || code === DayCount.Act365) {
		return code;
	}
	throw new MathError("InvalidCode");
}

/** Year basis used as the denominator of the coupon formula. */
export function basis(dc: DayCount): number {
	if (dc === DayCount.Thirty360) return 360;
	if (dc === DayCount.Act365) return 365;
	throw new MathError("UnsupportedDayCount");
}

/** A civil (calendar) date in UTC. */
export interface Ymd {
	/** Year. */
	readonly y: number;
	/** Month 1–12. */
	readonly m: number;
	/** Day 1–31. */
	readonly d: number;
}

function isLeap(y: number): boolean {
	return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function daysInMonth(y: number, m: number): number {
	if (m === 4 || m === 6 || m === 9 || m === 11) return 30;
	if (m === 2) return isLeap(y) ? 29 : 28;
	return 31;
}

/** Validated constructor (year must fit u16, like the crate). */
export function ymd(y: number, m: number, d: number): Ymd {
	const int = (v: number): boolean => Number.isInteger(v);
	if (!int(y) || !int(m) || !int(d) || y < 0 || y > 65_535) {
		throw new MathError("InvalidDate", `${y}-${m}-${d}`);
	}
	if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) {
		throw new MathError("InvalidDate", `${y}-${m}-${d}`);
	}
	return { y, m, d };
}

/** `yyyymmdd` packed into a u32 (e.g. `20260703`), as stored in `announce_action`. */
export function packYmd(date: Ymd): number {
	return date.y * 10_000 + date.m * 100 + date.d;
}

/** Civil date (UTC) of a unix timestamp — Howard Hinnant's `civil_from_days`. */
export function fromUnixUtc(ts: number): Ymd {
	if (!Number.isInteger(ts)) throw new MathError("InvalidDate", `${ts}`);
	const z = Math.floor(ts / 86_400) + 719_468;
	const era = Math.floor(z / 146_097);
	const doe = z - era * 146_097;
	const yoe = Math.floor(
		(doe - Math.floor(doe / 1_460) + Math.floor(doe / 36_524) - Math.floor(doe / 146_096)) / 365,
	);
	const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
	const mp = Math.floor((5 * doy + 2) / 153);
	const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
	const m = mp < 10 ? mp + 3 : mp - 9;
	return ymd(yoe + era * 400 + (m <= 2 ? 1 : 0), m, d);
}

/** Days since 1970-01-01 — Howard Hinnant's `days_from_civil`. */
export function daysFromEpoch(date: Ymd): number {
	const y = date.y - (date.m <= 2 ? 1 : 0);
	const era = Math.floor(y / 400);
	const yoe = y - era * 400;
	const doy = Math.floor((153 * (date.m > 2 ? date.m - 3 : date.m + 9) + 2) / 5) + date.d - 1;
	const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
	return era * 146_097 + doe - 719_468;
}

/** Accrual days between two civil dates under the given convention (§3). */
export function accrualDays(dc: DayCount, start: Ymd, end: Ymd): number {
	let days: number;
	if (dc === DayCount.Thirty360) {
		days =
			360 * (end.y - start.y) +
			30 * (end.m - start.m) +
			(Math.min(end.d, 30) - Math.min(start.d, 30));
	} else if (dc === DayCount.Act365) {
		days = daysFromEpoch(end) - daysFromEpoch(start);
	} else {
		throw new MathError("UnsupportedDayCount");
	}
	// Mirrors u32::try_from: negative (end before start) or out-of-range is InvalidPeriod.
	if (!Number.isSafeInteger(days) || days < 0 || days > 0xffff_ffff) {
		throw new MathError("InvalidPeriod", `${days}`);
	}
	return days;
}
