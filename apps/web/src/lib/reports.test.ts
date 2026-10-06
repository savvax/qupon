import { describe, expect, it } from "vitest";
import { csvHref, majorMinor, printHref } from "./reports";

/** The report helpers are the money paths of task 902: exact major-unit strings and filter-carrying URLs. */
describe("report helpers", () => {
  it("formats minor units exactly (brief numbers)", () => {
    expect(majorMinor(50000, 2)).toBe("500.00");
    expect(majorMinor(325000, 2, "tKZT")).toBe("3,250.00 tKZT");
    expect(majorMinor(1000000, 2, "tKZT")).toBe("10,000.00 tKZT");
    expect(majorMinor("0", 6)).toBe("0.000000");
  });

  it("keeps every filter in the CSV download URL", () => {
    expect(
      csvHref("me/reports/statement", { from: "2026-01-01", to: undefined }),
    ).toBe("/api/bo-get/me/reports/statement?from=2026-01-01&format=csv");
    expect(csvHref("me/reports/tax", { year: 2028 })).toBe(
      "/api/bo-get/me/reports/tax?year=2028&format=csv",
    );
  });

  it("builds printable-view URLs", () => {
    expect(printHref("holders", { mint: "Mint123" })).toBe(
      "/print/holders?mint=Mint123",
    );
    expect(printHref("statement", {})).toBe("/print/statement");
  });
});
