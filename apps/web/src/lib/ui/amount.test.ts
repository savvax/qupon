import { describe, expect, it } from "vitest";
import { formatAmount } from "./amount";

describe("formatAmount", () => {
  it("drops trailing zeros past the cents", () => {
    expect(formatAmount("1000000000", 6, "en")).toBe("1,000.00");
    expect(formatAmount("1000000000", 6, "ru")).toBe("1\u202f000,00");
    expect(formatAmount("1234567", 6, "en")).toBe("1.234567");
  });
  it("EN: comma thousands, dot decimals", () => {
    expect(formatAmount("500000", 2, "en")).toBe("5,000.00");
  });
  it("RU: narrow-space thousands, comma decimals", () => {
    expect(formatAmount("10500000", 2, "ru")).toBe("105 000,00");
  });
  it("6-decimal USDC and zero decimals", () => {
    expect(formatAmount("319000", 6, "en")).toBe("0.319");
    expect(formatAmount(65n, 0, "ru")).toBe("65");
  });
  it("very large values do not lose precision", () => {
    expect(formatAmount("123456789012345678", 2, "en")).toBe(
      "1,234,567,890,123,456.78",
    );
  });
});
