import { describe, expect, it } from "vitest";
import { computeUnitLimit } from "./tx.js";

describe("computeUnitLimit", () => {
  it("encodes SetComputeUnitLimit (tag 2, u32 LE) for the ComputeBudget program", () => {
    const ix = computeUnitLimit(600_000);
    expect(ix.programAddress).toBe("ComputeBudget111111111111111111111111111111");
    expect(Array.from(ix.data ?? [])).toEqual([2, 0xc0, 0x27, 0x09, 0x00]);
    expect(ix.accounts ?? []).toEqual([]);
  });
});
