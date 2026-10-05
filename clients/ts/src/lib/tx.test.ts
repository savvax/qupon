import { describe, expect, it } from "vitest";
import { anchorErrorFromLogs, computeUnitLimit, isTransient } from "./tx.js";

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

describe("anchorErrorFromLogs", () => {
  it("extracts the program error name, number and message", () => {
    const logs = [
      "Program QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd invoke [1]",
      "Program log: AnchorError thrown in programs/qupon_bonds/src/instructions/snapshot.rs:40. Error Code: TooEarly. Error Number: 6006. Error Message: Too early for this step.",
      "Program QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd failed: custom program error: 0x1776",
    ];
    expect(anchorErrorFromLogs(logs)).toBe("TooEarly (6006): Too early for this step");
  });
  it("is undefined without an Anchor error", () => {
    expect(anchorErrorFromLogs(undefined)).toBeUndefined();
    expect(anchorErrorFromLogs(["Program log: Error: insufficient funds"])).toBeUndefined();
  });
});
