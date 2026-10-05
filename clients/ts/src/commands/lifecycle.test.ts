import { address, getAddressDecoder } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { announcePlan } from "./action.js";
import { retirePairs, voteChoice } from "./lifecycle.js";

const A = address("11111111111111111111111111111112");
const B = address("11111111111111111111111111111113");
const C = address("11111111111111111111111111111114");
const pda = (n: number) => getAddressDecoder().decode(new Uint8Array(32).fill(n));

describe("announcePlan", () => {
  const s = { nextCouponDate: 1_798_916_400n, maturityDate: 1_846_177_200n };
  it("INTR ends at the next coupon, REDM at maturity", () => {
    expect(announcePlan("intr", s, undefined, undefined)).toMatchObject({ kind: "INTR", code: 0, periodEnd: s.nextCouponDate });
    expect(announcePlan("REDM", s, undefined, undefined)).toMatchObject({ kind: "REDM", code: 1, periodEnd: s.maturityDate });
  });
  it("MCAL/PCAL end at the Almaty midnight of the call date", () => {
    expect(announcePlan("MCAL", s, "2026-08-20", undefined).periodEnd).toBe(1_787_166_000n);
    expect(announcePlan("PCAL", s, "2026-08-20", "2500")).toMatchObject({ code: 3, factorBps: 2500 });
  });
  it("rejects inconsistent options", () => {
    expect(() => announcePlan("BMET", s, undefined, undefined)).toThrow(/--kind/);
    expect(() => announcePlan("MCAL", s, undefined, undefined)).toThrow(/--call-date/);
    expect(() => announcePlan("INTR", s, "2026-08-20", undefined)).toThrow(/only applies/);
    expect(() => announcePlan("PCAL", s, "2026-08-20", "10000")).toThrow(/factor/);
    expect(() => announcePlan("REDM", s, undefined, "100")).toThrow(/only applies to PCAL/);
  });
});

describe("retirePairs", () => {
  const investors = [
    { address: pda(1), owner: C, bondAta: pda(11) },
    { address: pda(2), owner: A, bondAta: pda(12) },
    { address: pda(3), owner: B, bondAta: pda(13) },
  ];
  it("entitlements not yet retired + orphans with a balance, owner-ascending", () => {
    const ents = [
      { address: pda(21), owner: C, status: 1 }, // Paid → retire
      { address: pda(22), owner: A, status: 2 }, // already Retired → skip
    ];
    const balances = new Map([[pda(13) as string, 1n]]); // B: no entitlement, holds 1 unit → orphan
    const pairs = retirePairs(ents, investors, balances);
    expect(pairs.map(p => [p.owner, p.first, p.bondAta, p.orphan])).toEqual([
      [B, pda(3), pda(13), true],
      [C, pda(21), pda(11), false],
    ]);
  });
  it("skips orphans with zero balance", () => {
    expect(retirePairs([], investors, new Map())).toEqual([]);
  });
});

describe("voteChoice", () => {
  it("maps choices", () => {
    expect([voteChoice("for"), voteChoice("AGAINST"), voteChoice("abstain")]).toEqual([1, 2, 3]);
    expect(() => voteChoice("maybe")).toThrow(/--choice/);
  });
});
