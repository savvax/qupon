import { describe, expect, it } from "vitest";
import { positionValuation, prevCouponDate } from "./position";
import type { SeriesDTO } from "./api";

const kzt = (minor: string) => ({
  minor,
  display: `${minor} KZT`,
  currency: "tKZT",
});

/** The brief's bond: 1,000 KZT face, 10% semi-annual 30E/360, maturing 2027-10-03. */
const series = {
  faceValue: kzt("100000"),
  couponRateBps: 1000,
  frequency: 2,
  dayCount: "THIRTY_360",
  maturityDate: "2027-10-03",
} as Pick<
  SeriesDTO,
  "faceValue" | "couponRateBps" | "frequency" | "dayCount" | "maturityDate"
>;

describe("prevCouponDate", () => {
  it("walks back from maturity in 6-month steps to the coupon date before today", () => {
    // Maturity 2027-10-03 → coupons 2027-04-03, 2026-10-03, …; today 2026-11-15 → prev 2026-10-03.
    expect(prevCouponDate("2027-10-03", 2, "2026-11-15")).toEqual({
      y: 2026,
      m: 10,
      d: 3,
    });
    expect(prevCouponDate("2027-10-03", 2, "2026-10-03")).toEqual({
      y: 2026,
      m: 10,
      d: 3,
    }); // on the date itself
  });

  it("returns undefined for a frequency that does not divide 12", () => {
    expect(prevCouponDate("2027-10-03", 5, "2026-11-15")).toBeUndefined();
  });
});

describe("positionValuation", () => {
  it("par bond on a coupon date: accrued 0, YTM equals the coupon rate (fixtures yield_cases)", () => {
    const v = positionValuation({ series, units: "10", today: "2026-10-03" });
    expect(v).toBeDefined();
    expect(v!.accrued).toBe(0n);
    expect(v!.clean).toBe(1_000_000n); // 10 × 1,000.00
    expect(v!.dirty).toBe(1_000_000n);
    expect(v!.ytm).toBeCloseTo(0.1, 10);
  });

  it("95 clean: YTM 0.15592 (fixtures discount_95), dirty = clean + accrued", () => {
    const v = positionValuation({
      series,
      units: "10",
      cleanPrice: 95_000n,
      today: "2026-10-03",
    });
    expect(v!.clean).toBe(950_000n);
    expect(v!.ytm).toBeCloseTo(0.15592, 5);
    expect(v!.dirty).toBe(v!.clean + v!.accrued);
  });

  it("30 days into the period: accrued 30E/360 half-up (10 × 1,000 × 10% × 29/360 = 80.56 KZT)", () => {
    const v = positionValuation({ series, units: "10", today: "2026-11-02" });
    expect(v!.accrued).toBe(8056n);
    expect(v!.dirty).toBe(v!.clean + 8056n);
  });

  it("returns undefined once matured", () => {
    expect(
      positionValuation({ series, units: "10", today: "2027-10-03" }),
    ).toBeUndefined();
  });
});
