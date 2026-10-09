import { describe, expect, it } from "vitest";
import { AccountRole, address } from "@solana/kit";
import { requiredFunding, toLegacyInstruction } from "./squads.js";

const A = address("So11111111111111111111111111111111111111112");
const P = address("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd");

describe("toLegacyInstruction", () => {
  it("maps every Kit role to signer/writable flags", () => {
    const ix = toLegacyInstruction({
      programAddress: P,
      accounts: [
        { address: A, role: AccountRole.READONLY },
        { address: A, role: AccountRole.WRITABLE },
        { address: A, role: AccountRole.READONLY_SIGNER },
        { address: A, role: AccountRole.WRITABLE_SIGNER },
      ],
      data: new Uint8Array([1, 2, 3]),
    });
    expect(ix.programId).toBe(P);
    expect(ix.keys.map(k => [k.isSigner, k.isWritable])).toEqual([[false, false], [false, true], [true, false], [true, true]]);
    expect([...ix.data]).toEqual([1, 2, 3]);
  });
  it("tolerates missing accounts/data", () => {
    expect(toLegacyInstruction({ programAddress: P })).toEqual({ programId: P, keys: [], data: new Uint8Array() });
  });
});

describe("requiredFunding", () => {
  it("brief coupon: 5,000.00 KZT net+tax, no principal", () => {
    expect(requiredFunding({ totalNet: 500_000n, totalTax: 0n, totalPrincipal: 0n })).toBe(500_000n);
    expect(requiredFunding({ totalNet: 1n, totalTax: 2n, totalPrincipal: 3n })).toBe(6n);
  });
});
