import { describe, expect, it } from "vitest";
import {
  bpsToPercent,
  currencyDecimals,
  formatAmount,
  formatDate,
  formatDateTime,
  formatMinor,
  frequencyLabel,
  shortKey,
  splitAmountDisplay,
} from "./format";

describe("shortKey", () => {
  it("keeps short keys intact", () => {
    expect(shortKey("abc")).toBe("abc");
  });
  it("truncates base58 pubkeys", () => {
    expect(shortKey("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")).toBe(
      "DL8G…aJEo",
    );
  });
});

describe("formatDate / formatDateTime", () => {
  it("formats for people per locale, in Almaty time (task 9106)", () => {
    expect(formatDate("2027-03-01", "ru")).toBe("01.03.2027");
    expect(formatDate("2027-03-01", "en")).toBe("Mar 1, 2027");
    expect(formatDate("2026-11-30T20:00:00Z", "en")).toBe("Dec 1, 2026");
    expect(formatDateTime("2027-02-28T18:30:00+05:00", "ru")).toBe(
      "28.02.2027, 18:30",
    );
    expect(formatDateTime("2027-02-28T18:30:00+05:00", "en")).toBe(
      "Feb 28, 2027, 18:30",
    );
  });
  it("formats an Almaty-offset timestamp as a date", () => {
    expect(formatDate("2026-12-01T00:00:00+05:00")).toBe("2026-12-01");
  });
  it("converts UTC into Asia/Almaty", () => {
    // 2026-11-30 20:00 UTC is already 2026-12-01 01:00 in Almaty.
    expect(formatDate("2026-11-30T20:00:00Z")).toBe("2026-12-01");
    expect(formatDateTime("2026-11-30T20:00:00Z")).toBe("2026-12-01 01:00");
  });
  it("formats date and time with minute precision", () => {
    expect(formatDateTime("2027-02-28T18:30:00+05:00")).toBe(
      "2027-02-28 18:30",
    );
  });
});

describe("bpsToPercent", () => {
  it("renders basis points as percent", () => {
    expect(bpsToPercent(1000)).toBe("10.00%");
    expect(bpsToPercent(1595)).toBe("15.95%");
    expect(bpsToPercent(6667)).toBe("66.67%");
  });
});

describe("frequencyLabel", () => {
  it("maps coupon frequencies", () => {
    expect(frequencyLabel(1)).toBe("annual");
    expect(frequencyLabel(2)).toBe("semi-annual");
    expect(frequencyLabel(4)).toBe("quarterly");
    expect(frequencyLabel(12)).toBe("monthly");
  });
  it("falls back for unknown values", () => {
    expect(frequencyLabel(3)).toBe("3×/yr");
  });
});

describe("formatAmount", () => {
  it("returns the API display string", () => {
    const amt: import("./api").Amount = {
      minor: "100000",
      display: "1,000.00 KZT",
      currency: "tKZT",
    };
    expect(formatAmount(amt)).toBe("1,000.00 KZT");
  });
});

describe("currencyDecimals / formatMinor", () => {
  it("maps settlement currencies to minor units", () => {
    expect(currencyDecimals("tKZT")).toBe(2);
    expect(currencyDecimals("USDC")).toBe(6);
    expect(currencyDecimals("XSU")).toBe(2); // unknown → 2
  });
  it("formats minor units with grouping", () => {
    expect(formatMinor("100000", 2)).toBe("1,000.00");
    expect(formatMinor("325000", 2)).toBe("3,250.00");
    expect(formatMinor("1234567", 6)).toBe("1.234567");
    expect(formatMinor("-500", 2)).toBe("-5.00");
    expect(formatMinor("12000", 0)).toBe("12,000");
  });
});

describe("splitAmountDisplay", () => {
  it("separates value and currency code", () => {
    expect(splitAmountDisplay("1,000.00 KZT")).toEqual(["1,000.00", "KZT"]);
    expect(splitAmountDisplay("1.00 USDC")).toEqual(["1.00", "USDC"]);
  });
  it("keeps bare numbers intact", () => {
    expect(splitAmountDisplay("12.50")).toEqual(["12.50", ""]);
  });
});
