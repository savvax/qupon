import { describe, expect, it } from "vitest";
import { formatAlmaty, formatMinor } from "./format.js";

describe("formatMinor", () => {
  it("formats whole units", () => {
    expect(formatMinor(500n, 2, "tKZT")).toBe("5.00 tKZT");
    expect(formatMinor(50000n, 2, "tKZT")).toBe("500.00 tKZT");
  });
  it("0", () => expect(formatMinor(0n, 2, "tKZT")).toBe("0.00 tKZT"));
  it("shows every minor digit exactly", () => {
    // display-level: exact division keeps full precision; extra precision beyond decimals truncated
    expect(formatMinor(123456n, 4, "tKZT")).toBe("12.3456 tKZT");
  });
  it("negative", () => expect(formatMinor(-150n, 2, "tKZT")).toBe("-1.50 tKZT"));
  it("decimals=0 has no fraction", () => expect(formatMinor(1000n, 0, "tKZT")).toBe("1000 tKZT"));
  it("brief coupon in tiyn", () => expect(formatMinor(50000n, 2, "KZT")).toBe("500.00 KZT"));
  it("brief numbers: 500/1250/3250 minor with 1 decimal", () => {
    expect(formatMinor(500n, 1, "KZT")).toBe("50.0 KZT");
    expect(formatMinor(1250n, 1, "KZT")).toBe("125.0 KZT");
    expect(formatMinor(3250n, 1, "KZT")).toBe("325.0 KZT");
    expect(formatMinor(10000n, 1, "KZT")).toBe("1000.0 KZT");
  });
});

describe("formatAlmaty", () => {
  it("converts unix to UTC+5", () => {
    // 2026-10-12 20:00 Almaty = 15:00 UTC
    expect(formatAlmaty(Date.UTC(2026, 9, 12, 15, 0, 0) / 1000)).toBe("2026-10-12 20:00:00 +05");
  });
  it("accepts bigint", () => {
    expect(formatAlmaty(0n)).toBe("1970-01-01 05:00:00 +05");
  });
});
