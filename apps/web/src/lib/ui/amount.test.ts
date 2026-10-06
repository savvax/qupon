import { describe, expect, it } from "vitest";
import { formatAmount, majorToMinor } from "./amount";

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
});
