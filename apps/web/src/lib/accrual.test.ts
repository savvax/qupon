import { describe, expect, it } from "vitest";
import { couponGross, days30E360, divHalfUp } from "./accrual";

describe("30E/360 coupon arithmetic", () => {
  it("counts a half-year as 180 days, day 31 as 30", () => {
    expect(days30E360("2026-09-01", "2027-03-01")).toBe(180);
    expect(days30E360("2026-08-31", "2027-02-28")).toBe(178);
    expect(days30E360("2026-01-31", "2026-03-31")).toBe(60);
  });
  it("reproduces the brief: 10 / 25 / 65 bonds × 1,000 ₸ × 10 % × 180/360", () => {
    expect([10n, 25n, 65n].map((u) => couponGross(u, 100_000n, 1000, 180))).toEqual([50_000n, 125_000n, 325_000n]);
  });
  it("rounds half-up per holder", () => {
    expect(divHalfUp(5n, 2n)).toBe(3n);
    expect(divHalfUp(4n, 3n)).toBe(1n);
    // 1 bond, 1,000.00 ₸, 10 %, 47 days → 13.0555… ₸ → 13.06
    expect(couponGross(1n, 100_000n, 1000, 47)).toBe(1306n);
  });
});
