/** Accrued-interest tests against fixtures/entitlement.json `accrued_cases`. */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DayCount, ymd } from "./daycount.js";
import { accruedSigned } from "./accrued.js";

interface AccruedCase {
	id: string;
	units: number;
	face: number;
	rate_bps: number;
	day_count: "THIRTY_360" | "ACT_365";
	start: string;
	settle: string;
	days: number;
	accrued: number;
}

const fixtures = JSON.parse(
	readFileSync(
		new URL("../../../../fixtures/entitlement.json", import.meta.url),
		"utf8",
	),
) as { accrued_cases: AccruedCase[] };

const DC: Record<AccruedCase["day_count"], DayCount> = {
	THIRTY_360: DayCount.Thirty360,
	ACT_365: DayCount.Act365,
};

const date = (s: string) =>
	ymd(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10));

describe("accrued_cases fixtures", () => {
	for (const c of fixtures.accrued_cases) {
		it(`${c.id}: accrued=${c.accrued} days=${c.days}`, () => {
			const r = accruedSigned(
				BigInt(c.units),
				BigInt(c.face),
				c.rate_bps,
				DC[c.day_count],
				date(c.start),
				date(c.settle),
			);
			expect(r.amount).toBe(BigInt(c.accrued));
			expect(r.days).toBe(c.days);
		});
	}
});

describe("accruedSigned conventions", () => {
	it("ex-coupon: sign flips with the same magnitude (278 either way)", () => {
		const dc = DayCount.Thirty360;
		const fwd = accruedSigned(
			10n,
			100_000n,
			1000,
			dc,
			date("2027-01-02"),
			date("2027-01-03"),
		);
		const back = accruedSigned(
			10n,
			100_000n,
			1000,
			dc,
			date("2027-01-03"),
			date("2027-01-02"),
		);
		expect(fwd.amount).toBe(-back.amount);
		expect(fwd.days).toBe(-back.days);
	});
	it("zero units accrue nothing", () => {
		const r = accruedSigned(
			0n,
			100_000n,
			1000,
			DayCount.Thirty360,
			date("2026-10-03"),
			date("2026-11-03"),
		);
		expect(r).toEqual({ amount: 0n, days: 30 });
	});
});
