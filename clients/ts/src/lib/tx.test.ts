import { describe, expect, it } from "vitest";
import { computeUnitLimit, isTransient } from "./tx.js";

describe("computeUnitLimit", () => {
  it("encodes SetComputeUnitLimit (tag 2, u32 LE) for the ComputeBudget program", () => {
    const ix = computeUnitLimit(600_000);
    expect(ix.programAddress).toBe("ComputeBudget111111111111111111111111111111");
    expect(Array.from(ix.data ?? [])).toEqual([2, 0xc0, 0x27, 0x09, 0x00]);
    expect(ix.accounts ?? []).toEqual([]);
  });
});

describe("isTransient", () => {
  it("retries network and 429/5xx failures only", () => {
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
    expect(isTransient(Object.assign(new Error("HTTP error (429): Too Many Requests"), {}))).toBe(true);
    expect(isTransient(Object.assign(new Error("x"), { context: { statusCode: 503 } }))).toBe(true);
    expect(isTransient(new Error("custom program error: 0x1771"))).toBe(false);
  });
});
