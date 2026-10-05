import { describe, expect, it } from "vitest";
import {
  addMonthsYmd,
  parseMajor,
  parseRateBps,
  schedulePreview,
} from "./schedulePreview";

describe("schedulePreview", () => {
  it("brief: 1 000 KZT, 10%, semi-annual, 2 years → 4 coupons of 50.00", () => {
    const rows = schedulePreview({
      faceMinor: 100000n,
      rateBps: 1000,
      frequency: 2,
      dayCount: "THIRTY_360",
      issueDate: "2026-07-03",
      maturityDate: "2028-07-03",
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.perUnitMinor === 5000n)).toBe(true);
    expect(rows[3]?.periodEnd).toBe("2028-07-03");
  });
  it("end-of-month dates clamp (Aug 31 + 6 months = Feb 28) and are computed from the issue date", () => {
    const rows = schedulePreview({
      faceMinor: 100000n,
      rateBps: 1000,
      frequency: 2,
      dayCount: "THIRTY_360",
      issueDate: "2026-08-31",
      maturityDate: "2027-08-31",
    });
    expect(rows[0]?.periodEnd).toBe("2027-02-28");
    expect(rows[1]?.periodEnd).toBe("2027-08-31");
  });
  it("ACT/365 uses actual days, rounded half-up", () => {
    const rows = schedulePreview({
      faceMinor: 100000n,
      rateBps: 1000,
      frequency: 2,
      dayCount: "ACT_365",
      issueDate: "2026-01-01",
      maturityDate: "2027-01-01",
    });
    // 181 days: 100000 × 1000 × 181 / (10000 × 365) = 4958.9 → 4959
    expect(rows[0]?.perUnitMinor).toBe(4959n);
  });
  it("returns nothing for dates that do not fit a full period", () => {
    expect(
      schedulePreview({
        faceMinor: 100000n,
        rateBps: 1000,
        frequency: 1,
        dayCount: "THIRTY_360",
        issueDate: "2026-01-01",
        maturityDate: "2026-06-01",
      }),
    ).toEqual([]);
  });
});

describe("input parsing", () => {
  it.each([
    ["1000", 2, 100000n],
    ["1 000,5", 2, 100050n],
    ["0.000001", 6, 1n],
  ])("parseMajor(%s, %i) = %s", (s, d, want) => {
    expect(parseMajor(s, d)).toBe(want);
  });
  it("rejects too many decimals, zero and junk", () => {
    expect(parseMajor("1.001", 2)).toBeUndefined();
    expect(parseMajor("0", 2)).toBeUndefined();
    expect(parseMajor("abc", 2)).toBeUndefined();
  });
  it("parses rates into bps", () => {
    expect(parseRateBps("10")).toBe(1000);
    expect(parseRateBps("15,95")).toBe(1595);
    expect(parseRateBps("0")).toBeUndefined();
    expect(parseRateBps("100.01")).toBeUndefined();
  });
  it("adds months with month-end clamping", () => {
    expect(addMonthsYmd("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsYmd("2026-11-30", 3)).toBe("2027-02-28");
  });
});
