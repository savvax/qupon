/** Day-count tests against fixtures/entitlement.json (docs/03-domain.md §3, §8). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { type Ymd, DayCount, accrualDays, fromUnixUtc, packYmd, ymd } from "./daycount.js";

interface DayCountCase {
	id: string;
	day_count: "THIRTY_360" | "ACT_365" | "ACT_ACT";
	start: string;
	end: string;
	days: number;
}

const fixtures = JSON.parse(
	readFileSync(new URL("../../../../fixtures/entitlement.json", import.meta.url), "utf8"),
) as { day_count_cases: DayCountCase[] };

const DC: Record<DayCountCase["day_count"], DayCount> = {
	THIRTY_360: DayCount.Thirty360,
	ACT_365: DayCount.Act365,
	ACT_ACT: DayCount.ActAct,
};

/** "2026-07-03" → Ymd. */
function parseYmd(s: string): Ymd {
	const [y, m, d] = s.split("-");
	return ymd(Number(y), Number(m), Number(d));
}

describe("day_count_cases fixtures", () => {
	for (const c of fixtures.day_count_cases) {
		it(`${c.id}: ${c.start} → ${c.end} = ${c.days}`, () => {
			expect(accrualDays(DC[c.day_count], parseYmd(c.start), parseYmd(c.end))).toBe(c.days);
		});
	}
});

describe("Ymd", () => {
	it("packYmd packs yyyymmdd", () => {
		expect(packYmd(ymd(2026, 7, 3))).toBe(20_260_703);
	});

	it("fromUnixUtc derives the UTC civil date", () => {
		expect(packYmd(fromUnixUtc(Date.UTC(2026, 6, 3) / 1000))).toBe(20_260_703);
		expect(packYmd(fromUnixUtc(0))).toBe(19_700_101);
		expect(packYmd(fromUnixUtc(-1))).toBe(19_691_231); // floor division, not truncation
	});

	it("rejects invalid dates", () => {
		expect(() => ymd(2026, 2, 30)).toThrow(/InvalidDate/);
		expect(() => ymd(2026, 13, 1)).toThrow(/InvalidDate/);
		expect(() => ymd(70_000, 1, 1)).toThrow(/InvalidDate/); // year must fit u16
	});
});

describe("accrualDays edge cases", () => {
	it("ACT/ACT is reserved and throws", () => {
		expect(() => accrualDays(DayCount.ActAct, ymd(2026, 1, 1), ymd(2027, 1, 1))).toThrow(
			/UnsupportedDayCount/,
		);
	});

	it("end before start throws InvalidPeriod", () => {
		expect(() => accrualDays(DayCount.Thirty360, ymd(2026, 8, 20), ymd(2026, 7, 3))).toThrow(
			/InvalidPeriod/,
		);
	});

	it("30E/360 clamps both days at 30 (eom_30e)", () => {
		expect(accrualDays(DayCount.Thirty360, ymd(2026, 1, 31), ymd(2026, 2, 28))).toBe(28);
	});
});
