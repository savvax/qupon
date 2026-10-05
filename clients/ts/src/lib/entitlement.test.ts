/** Entitlement tests against fixtures/entitlement.json (docs/03-domain.md §2, §8). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DayCount } from "./daycount.js";
import {
	BPS,
	type Kind,
	Kind as K,
	computeEntitlement,
	roundingWithinTolerance,
	roundHalfUp,
} from "./entitlement.js";

interface Case {
	id: string;
	kind: "INTR" | "REDM" | "MCAL";
	units: number;
	face: number;
	rate_bps: number;
	day_count: "THIRTY_360" | "ACT_365";
	days: number;
	tax_bps: number;
	gross: number;
	tax: number;
	net: number;
	principal: number;
}

interface Fixtures {
	cases: Case[];
	totals_check: {
		supply: number;
		per_unit_gross: number;
		sum_gross: number;
		max_drift_allowed: number;
	};
}

const fixtures = JSON.parse(
	readFileSync(new URL("../../../../fixtures/entitlement.json", import.meta.url), "utf8"),
) as Fixtures;

const DC: Record<Case["day_count"], DayCount> = {
	THIRTY_360: DayCount.Thirty360,
	ACT_365: DayCount.Act365,
};

const KIND: Record<Case["kind"], Kind> = {
	INTR: K.Interest,
	REDM: K.Redemption,
	MCAL: K.EarlyRedemption,
};

function compute(c: Case) {
	return computeEntitlement({
		units: BigInt(c.units),
		face: BigInt(c.face),
		rateBps: c.rate_bps,
		dayCount: DC[c.day_count],
		days: c.days,
		taxBps: c.tax_bps,
		kind: KIND[c.kind],
	});
}

describe("cases fixtures", () => {
	for (const c of fixtures.cases) {
		it(`${c.id}: gross=${c.gross} tax=${c.tax} net=${c.net} principal=${c.principal}`, () => {
			const e = compute(c);
			expect(e.gross).toBe(BigInt(c.gross));
			expect(e.tax).toBe(BigInt(c.tax));
			expect(e.net).toBe(BigInt(c.net));
			expect(e.principal).toBe(BigInt(c.principal));
		});
	}
});

describe("roundHalfUp", () => {
	it("rounds ties away from zero (half_up_tie pins this)", () => {
		expect(roundHalfUp(1n, 2n)).toBe(1n); // 0.5 → 1, banker's would give 0
		expect(roundHalfUp(3n, 2n)).toBe(2n); // 1.5 → 2
		expect(roundHalfUp(1n, 3n)).toBe(0n); // 0.333… → 0
		expect(roundHalfUp(2n, 3n)).toBe(1n); // 0.666… → 1
		expect(() => roundHalfUp(1n, 0n)).toThrow(RangeError);
	});
});

describe("property: Σ holders within holders/2 of supply × exact per-unit", () => {
	const splits: bigint[][] = [
		[10n, 25n, 65n], // the brief's holders, supply 100
		[1n, 1n, 1n],
		[7n, 13n, 29n, 51n],
		[100n],
	];
	const coupons = [
		{ rateBps: 1000, dayCount: DayCount.Thirty360, days: 180 }, // brief, exact 5000/unit
		{ rateBps: 1595, dayCount: DayCount.Thirty360, days: 47 }, // MCAL, per-unit drift
		{ rateBps: 1000, dayCount: DayCount.Act365, days: 184 }, // ACT/365 drift
	];

	it("summed gross stays within holders/2 of the exact fraction", () => {
		for (const holders of splits) {
			for (const cp of coupons) {
				const sum = holders.reduce(
					(acc, u) =>
						acc +
						computeEntitlement({
							units: u,
							face: 100_000n,
							rateBps: cp.rateBps,
							dayCount: cp.dayCount,
							days: cp.days,
							taxBps: 0,
							kind: K.Interest,
						}).gross,
					0n,
				);
				const den = BPS * BigInt(cp.dayCount === DayCount.Act365 ? 365 : 360);
				const supply = holders.reduce((a, u) => a + u, 0n);
				const exact = 100_000n * BigInt(cp.rateBps) * BigInt(cp.days) * supply; // supply × per-unit
				const drift = sum * den - exact;
				expect(
					drift < 0n ? -drift : drift,
					`holders=${holders.join("+")} rate=${cp.rateBps} days=${cp.days}`,
				).toBeLessThanOrEqual((BigInt(holders.length) * den) / 2n);
			}
		}
	});

	it("matches the fixture totals_check", () => {
		const t = fixtures.totals_check;
		const sum = splits[0]!.reduce((acc, u) => acc + compute({ ...fixtures.cases[0]!, units: Number(u) }).gross, 0n);
		expect(sum).toBe(BigInt(t.sum_gross));
		expect(Number(sum) - t.supply * t.per_unit_gross).toBeLessThanOrEqual(t.max_drift_allowed);
	});
});

describe("u64 overflow parity with Rust", () => {
	const base = {
		rateBps: 1000,
		dayCount: DayCount.Thirty360,
		days: 180,
		taxBps: 0,
		kind: K.Interest,
	};
	const u64Max = (1n << 64n) - 1n;
	it("rejects units or face above u64::MAX", () => {
		expect(() => computeEntitlement({ ...base, units: u64Max + 1n, face: 1n })).toThrow(/Overflow/);
		expect(() => computeEntitlement({ ...base, units: 1n, face: u64Max + 1n })).toThrow(/Overflow/);
	});
	it("rejects gross/principal above u64::MAX", () => {
		// face × units ≈ u128 → gross ≫ u64
		expect(() =>
			computeEntitlement({ ...base, units: u64Max, face: u64Max }),
		).toThrow(/Overflow/);
		// principal = units × face overflows u64
		expect(() =>
			computeEntitlement({ ...base, kind: K.Redemption, units: 1n << 32n, face: 1n << 32n }),
		).toThrow(/Overflow/);
	});
});

describe("roundingWithinTolerance (MCAL 47 days, face 100k, 1595bps)", () => {
	const p = {
		supply: 10n,
		holders: 1,
		face: 100_000n,
		rateBps: 1595,
		dayCount: DayCount.Thirty360 as const,
		days: 47,
	};
	it("accepts the per-holder-rounded sum (20,824), not 10 × rounded per-unit (20,820)", () => {
		expect(roundingWithinTolerance({ ...p, sumGross: 20_824n })).toBe(true);
	});
	it("rejects a sum beyond holders/2 drift (20,826)", () => {
		expect(roundingWithinTolerance({ ...p, sumGross: 20_826n })).toBe(false);
	});
	it("accepts the fixture totals_check", () => {
		const t = fixtures.totals_check;
		const c0 = fixtures.cases[0]!;
		expect(
			roundingWithinTolerance({
				supply: BigInt(t.supply),
				holders: 3,
				face: BigInt(c0.face),
				rateBps: c0.rate_bps,
				dayCount: DC[c0.day_count],
				days: c0.days,
				sumGross: BigInt(t.sum_gross),
			}),
		).toBe(true);
	});
});

describe("kinds not covered by fixtures", () => {
	it("PCAL redeems factor_bps of face", () => {
		const e = computeEntitlement({
			units: 10n,
			face: 100_000n,
			rateBps: 1000,
			dayCount: DayCount.Thirty360,
			days: 180,
			taxBps: 0,
			kind: K.PartialRedemption,
			factorBps: 2500,
		});
		expect(e.principal).toBe(250_000n);
	});

	it("BMET/CHAN carry no principal; negative tax over 100% is rejected", () => {
		for (const kind of [K.Meeting, K.TermsChange]) {
			expect(
				computeEntitlement({
					units: 10n,
					face: 100_000n,
					rateBps: 1000,
					dayCount: DayCount.Thirty360,
					days: 180,
					taxBps: 0,
					kind,
				}).principal,
			).toBe(0n);
		}
		expect(() =>
			computeEntitlement({
				units: 1n,
				face: 100_000n,
				rateBps: 1000,
				dayCount: DayCount.Thirty360,
				days: 180,
				taxBps: 10_001, // gross 5000 → tax 5001 → net −1
				kind: K.Interest,
			}),
		).toThrow(/Overflow/);
	});
});
