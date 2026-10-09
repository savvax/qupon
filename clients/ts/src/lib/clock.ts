/**
 * Civil clock mirroring `crates/entitlement` `CivilClock` (plan 15 D7):
 * real = Almaty midnights (day = 86 400 s, offset from UTC); demo =
 * `daySecs` seconds per civil day counted from the issue timestamp, so a
 * whole bond life fits in minutes with the same civil-day math.
 * Vectors: fixtures/entitlement.json `clock_cases`.
 */
import {
	type Ymd,
	MathError,
	addMonths,
	daysFromEpoch,
	fromUnixUtc,
} from "./daycount.js";

/** Length of one civil day on the real clock. */
const REAL_DAY_SECS = 86_400;

/** Maps civil dates to timestamps on this clock (value type, like the crate). */
export class CivilClock {
	/** Length of one civil day in seconds (86 400 = real clock). */
	readonly daySecs: number;
	/** Timestamp of the `anchorDays` civil date's midnight. */
	readonly anchorTs: number;
	/** Days since 1970-01-01 of the anchor civil date. */
	readonly anchorDays: number;

	private constructor(daySecs: number, anchorTs: number, anchorDays: number) {
		this.daySecs = daySecs;
		this.anchorTs = anchorTs;
		this.anchorDays = anchorDays;
	}

	/** Real clock for a UTC offset in seconds (Asia/Almaty = 5 × 3600). */
	static real(utcOffsetSecs: number): CivilClock {
		return new CivilClock(REAL_DAY_SECS, -utcOffsetSecs, 0);
	}

	/** Demo clock: `daySecs` seconds per civil day, anchored at the issue timestamp. */
	static demo(daySecs: number, issueTs: number, issue: Ymd): CivilClock {
		if (
			!Number.isInteger(daySecs) ||
			daySecs <= 0 ||
			daySecs >= REAL_DAY_SECS
		) {
			throw new MathError("InvalidPeriod", `daySecs=${daySecs}`);
		}
		return new CivilClock(daySecs, issueTs, daysFromEpoch(issue));
	}

	/** True when this clock runs on compressed days. */
	isDemo(): boolean {
		return this.daySecs !== REAL_DAY_SECS;
	}

	/** True iff `ts` is a midnight of this clock. */
	isMidnight(ts: number): boolean {
		const d = ts - this.anchorTs;
		return ((d % this.daySecs) + this.daySecs) % this.daySecs === 0;
	}

	/** Civil date of a midnight timestamp (error if `ts` is not a midnight of this clock). */
	civil(ts: number): Ymd {
		if (!this.isMidnight(ts)) throw new MathError("InvalidDate", `${ts}`);
		return this.floorCivil(ts);
	}

	/** Civil date containing `ts` (any time of day). */
	floorCivil(ts: number): Ymd {
		const d = Math.floor((ts - this.anchorTs) / this.daySecs);
		return civilFromDays(this.anchorDays + d);
	}

	/** Midnight timestamp of civil date `d`. */
	ts(d: Ymd): number {
		const n =
			(daysFromEpoch(d) - this.anchorDays) * this.daySecs + this.anchorTs;
		if (!Number.isSafeInteger(n)) throw new MathError("Overflow", `${n}`);
		return n;
	}

	/** Midnight timestamp `months` months after the midnight `ts` (clamped to month end). */
	addMonths(ts: number, months: number): number {
		return this.ts(addMonths(this.civil(ts), months));
	}
}

/** Civil date from days since 1970-01-01 — mirrors `Ymd::from_days`. */
export function civilFromDays(days: number): Ymd {
	if (!Number.isInteger(days)) throw new MathError("InvalidDate", `${days}`);
	return fromUnixUtc(days * 86_400);
}
