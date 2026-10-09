/** Yield tests against fixtures/entitlement.json `yield_cases` (tolerance 1e-5). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DayCount, ymd } from "./daycount.js";
import { currentYield, dirtyPrice, ytm } from "./yield.js";

interface YieldCase {
	id: string;
	clean: number;
	face: number;
	rate_bps: number;
	frequency: number;
	settle: string;
	maturity: string;
	ytm: number;
}

const fixtures = JSON.parse(
	readFileSync(
		new URL("../../../../fixtures/entitlement.json", import.meta.url),
		"utf8",
	),
) as { yield_cases: YieldCase[] };

const date = (s: string) =>
	ymd(+s.slice(0, 4), +s.slice(5, 7), +s.slice(8, 10));

describe("yield_cases fixtures", () => {
	for (const c of fixtures.yield_cases) {
		it(`${c.id}: ytm=${c.ytm}`, () => {
			const r = ytm({
				cleanPrice: BigInt(c.clean),
				face: BigInt(c.face),
				rateBps: c.rate_bps,
				frequency: c.frequency,
				settle: date(c.settle),
				maturity: date(c.maturity),
				dayCount: DayCount.Thirty360,
			});
			expect(Math.abs(r - c.ytm)).toBeLessThanOrEqual(1e-5);
		});
	}
});

describe("dirtyPrice", () => {
	it("clean + accrued, per unit", () => {
		expect(dirtyPrice(95_000n, 2_778n)).toBe(97_778n);
		expect(dirtyPrice(100_000n, 0n)).toBe(100_000n);
	});
});

describe("currentYield", () => {
	it("annual coupon over clean price", () => {
		expect(currentYield(1000, 100_000n, 100_000n)).toBeCloseTo(0.1, 10);
		expect(currentYield(1000, 100_000n, 95_000n)).toBeCloseTo(
			10_000 / 95_000,
			10,
		);
	});
	it("rejects a zero clean price", () => {
		expect(() => currentYield(1000, 100_000n, 0n)).toThrow(RangeError);
	});
});

describe("ytm sanity", () => {
	it("solves mid-coupon settlement too (accrued folded into the dirty price)", () => {
		// 30 days into the 2026-10-03 → 2027-04-03 period; clean 94,000.
		const r = ytm({
			cleanPrice: 94_000n,
			face: 100_000n,
			rateBps: 1000,
			frequency: 2,
			settle: date("2026-11-03"),
			maturity: date("2027-10-03"),
			dayCount: DayCount.Thirty360,
		});
		expect(r).toBeGreaterThan(0.1);
		expect(r).toBeLessThan(0.2);
	});
	it("rejects settle on/after maturity", () => {
		expect(() =>
			ytm({
				cleanPrice: 100_000n,
				face: 100_000n,
				rateBps: 1000,
				frequency: 2,
				settle: date("2027-10-03"),
				maturity: date("2027-10-03"),
				dayCount: DayCount.Thirty360,
			}),
		).toThrow(RangeError);
	});
});
