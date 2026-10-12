/** Clock tests against fixtures/entitlement.json `clock_cases` (plan 15 D7). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ymd } from "./daycount.js";
import { CivilClock, seriesClock, unpackYmd } from "./clock.js";

interface ClockCase {
	id: string;
	day_secs: number;
	issue_ts?: number;
	issue_ymd?: number;
	ymd: number;
	ts: number;
	plus_months: number;
	plus_months_ts: number;
}

const fixtures = JSON.parse(
	readFileSync(
		new URL("../../../../fixtures/entitlement.json", import.meta.url),
		"utf8",
	),
) as { clock_cases: ClockCase[] };

function clockOf(c: ClockCase): CivilClock {
	return c.day_secs === 0
		? CivilClock.real(5 * 3600) // Asia/Almaty
		: CivilClock.demo(c.day_secs, c.issue_ts!, ymdFromPacked(c.issue_ymd!));
}

function ymdFromPacked(v: number): ReturnType<typeof ymd> {
	return ymd(Math.trunc(v / 10_000), Math.trunc(v / 100) % 100, v % 100);
}

describe("clock_cases fixtures", () => {
	for (const c of fixtures.clock_cases) {
		it(`${c.id}: ts(ymd)=${c.ts}, civil(ts)=${c.ymd}, +${c.plus_months}m=${c.plus_months_ts}`, () => {
			const clock = clockOf(c);
			const d = ymdFromPacked(c.ymd);
			expect(clock.ts(d)).toBe(c.ts);
			expect(clock.civil(c.ts)).toEqual(d);
			expect(clock.addMonths(c.ts, c.plus_months)).toBe(c.plus_months_ts);
		});
	}
});

describe("CivilClock validation", () => {
	it("real clock is not demo; demo clock is", () => {
		expect(CivilClock.real(5 * 3600).isDemo()).toBe(false);
		expect(CivilClock.demo(1, 0, ymd(2026, 10, 9)).isDemo()).toBe(true);
	});
	it("rejects day_secs 0 and ≥ 86400", () => {
		expect(() => CivilClock.demo(0, 0, ymd(2026, 10, 9))).toThrow(
			/InvalidPeriod/,
		);
		expect(() => CivilClock.demo(86_400, 0, ymd(2026, 10, 9))).toThrow(
			/InvalidPeriod/,
		);
	});
	it("civil() rejects a non-midnight timestamp", () => {
		const clock = CivilClock.real(5 * 3600);
		expect(() => clock.civil(1_791_000_001)).toThrow(/InvalidDate/);
	});
});

describe("seriesClock (program SeriesClock::of)", () => {
	it("day_secs 0 is the real Almaty clock, whatever issue_ymd says", () => {
		const c = seriesClock({ daySecs: 0, issueDate: 1_783_018_800n, issueYmd: 0 });
		expect(c.isDemo()).toBe(false);
		expect(c.ts({ y: 2027, m: 1, d: 3 })).toBe(1_798_916_400);
	});
	it("a demo series maps its calendar onto day_secs from the issue instant", () => {
		const c = seriesClock({ daySecs: 1, issueDate: 1_791_000_000n, issueYmd: 20261009 });
		expect(c.isDemo()).toBe(true);
		expect(c.ts({ y: 2027, m: 10, d: 9 })).toBe(1_791_000_365);
		expect(c.addMonths(1_791_000_000, 6)).toBe(1_791_000_182);
		expect(unpackYmd(20260831)).toEqual({ y: 2026, m: 8, d: 31 });
	});
});
