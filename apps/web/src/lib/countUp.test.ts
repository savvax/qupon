import { describe, expect, it } from "vitest";
import { formatLike, splitNumber } from "./countUp";

describe("splitNumber / formatLike", () => {
  it.each([
    ["6,060 ₸", "", "6,060", " ₸"],
    ["₸ 1 250.50", "₸ ", "1 250.50", ""],
    ["3", "", "3", ""],
    ["12.5%", "", "12.5", "%"],
  ])("%s round-trips", (value, prefix, digits, suffix) => {
    const p = splitNumber(value);
    expect(p).not.toBeNull();
    expect(p?.prefix).toBe(prefix);
    expect(p?.suffix).toBe(suffix);
    expect(formatLike(p?.n ?? 0, p ?? { sep: "", decimals: 0 })).toBe(digits);
  });
  it("leaves text without numbers alone", () => {
    expect(splitNumber("—")).toBeNull();
  });
  it("formats intermediate values with the same separator", () => {
    const p = splitNumber("10,000 ₸");
    expect(p && formatLike(1234.4, p)).toBe("1,234");
  });
});
