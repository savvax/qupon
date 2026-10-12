import { describe, expect, it } from "vitest";
import {
  currencyDecimals,
  formatAmount,
  formatMoney,
  majorToMinor,
  renderDecimals,
} from "./amount";

describe("majorToMinor", () => {
  it("converts API major-unit strings to exact minor units", () => {
    expect(majorToMinor("10000.00", 2)).toBe(1_000_000n);
    expect(majorToMinor("500.00", 2)).toBe(50_000n);
    expect(majorToMinor("0.5", 6)).toBe(500_000n);
    expect(majorToMinor("0", 2)).toBe(0n);
    expect(majorToMinor("-1.23", 2)).toBe(-123n);
  });

  it("round-trips totals through formatAmount (RU groups with U+202F)", () => {
    expect(formatAmount(majorToMinor("10000.00", 2), 2, "ru")).toBe(
      "10\u202f000,00",
    );
  });

  it("KK groups like RU, never a comma (pre-flight #18/#19)", () => {
    expect(formatAmount(majorToMinor("10000.00", 2), 2, "kk")).toBe(
      "10\u202f000,00",
    );
    expect(formatAmount(majorToMinor("2034.90", 2), 2, "kk")).toBe(
      "2\u202f034,90",
    );
  });
});

describe("currencyDecimals (the one table)", () => {
  it("maps every settlement currency of the registry and mocks", () => {
    expect(currencyDecimals("tKZT")).toBe(2);
    expect(currencyDecimals("KZT")).toBe(2);
    expect(currencyDecimals("KZTE")).toBe(2);
    expect(currencyDecimals("KZTE-dev")).toBe(2);
    expect(currencyDecimals("dKZT")).toBe(2);
    expect(currencyDecimals("USDC")).toBe(6);
    expect(currencyDecimals("tUSDC")).toBe(6);
    expect(currencyDecimals("XSU")).toBe(2); // unknown → 2
  });
});

describe("formatMoney (the one number–sign spacing rule, A91567-7)", () => {
  it("puts an NBSP before the sign in every locale — never glued, never a breaking space", () => {
    expect(formatMoney("1,000.00", "tKZT")).toBe("1,000.00\u00a0₸");
    expect(formatMoney("10\u202f000,00", "KZT")).toBe("10\u202f000,00\u00a0₸");
    expect(formatMoney("12.50", "USDC")).toBe("12.50\u00a0USDC");
  });
  it("accepts a raw sign (the proof page maps cash mints) and drops it when empty", () => {
    expect(formatMoney("3,250.00", "₸")).toBe("3,250.00\u00a0₸");
    expect(formatMoney("100", "")).toBe("100");
  });
});

describe("report totals at the currency's own decimals (task 1417)", () => {
  it("USDC totals: Go's major string '12.500000' renders 12.50", () => {
    // Totals arrive as major strings at the currency's decimals (Go reports.Sum):
    // a hardcoded 2 cut USDC totals 10,000× too small.
    const d = currencyDecimals("USDC");
    expect(formatAmount(majorToMinor("12.500000", d), d, "en")).toBe("12.50");
  });

  it('<Amount currency="tUSDC" minor="1000000"> renders 1.00', () => {
    const d = renderDecimals("1000000", "tUSDC");
    expect(formatAmount("1000000", d, "en")).toBe("1.00");
  });
});

describe("renderDecimals (API-carried decimals beat the table)", () => {
  it("uses an explicit decimals field", () => {
    expect(renderDecimals({ minor: "5", decimals: 8 }, "USDC")).toBe(8);
  });
  it("falls back to the fraction digits of the API display string", () => {
    expect(
      renderDecimals({ minor: "50000", display: "0.050000 USDC" }, "USDC"),
    ).toBe(6);
  });
  it("then to the currency table, then 2", () => {
    expect(renderDecimals("1000", "tUSDC")).toBe(6);
    expect(renderDecimals("1000", "XSU")).toBe(2);
  });
  it("never lets a display string override an explicit prop", () => {
    expect(renderDecimals({ minor: "5", display: "0.05 X" }, "tKZT", 2)).toBe(
      2,
    );
  });
});

describe("renderDecimals with a mock-style display (task 1421)", () => {
  it("prefers the API decimals over the display's fraction digits", () => {
    expect(
      renderDecimals(
        { minor: "1000000000", display: "1,000.00 USDC", decimals: 6 },
        "USDC",
      ),
    ).toBe(6);
  });
});
