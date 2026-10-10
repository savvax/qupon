import { describe, expect, it } from "vitest";
import type { ActionDTO } from "@/lib/api";
import { deriveAlerts } from "./alerts";

const kzt = (minor: string) => ({
  minor,
  display: `${minor} KZT`,
  currency: "tKZT",
});

// REDM at SnapshotComplete: 100 units × 1,000 KZT principal, net+tax already summed by the chain.
const redm: ActionDTO = {
  pda: "ActionPda1111111111111111111111111111111111111",
  seriesMint: "Mint111111111111111111111111111111111111111",
  kind: "REDM",
  mandatory: "MAND",
  corpId: "QPNb1-REDM-0001",
  recordAt: "2027-02-28T00:00:00+05:00",
  paymentAt: "2027-03-01T00:00:00+05:00",
  perUnitGross: kzt("0"),
  perUnitPrincipal: kzt("1000000"),
  cashMint: "Cash111111111111111111111111111111111111111",
  escrow: "Escrow11111111111111111111111111111111111111",
  status: "SnapshotComplete",
  unitsSnapshotted: "100",
  totalNet: kzt("325000"),
  totalTax: kzt("162500"),
  escrowBalance: kzt("487500"),
  explorerUrl: "https://explorer.solana.com/address/x?cluster=devnet",
};

// Pinned before the payment date + grace so the escrow-short cases stay deterministic for years.
const BEFORE_DUE = new Date("2027-03-01T12:00:00+05:00");
const AFTER_DUE = new Date("2027-03-02T00:00:00+05:00");

describe("deriveAlerts", () => {
  it("flags a redemption escrow that covers net+tax but not the principal", () => {
    expect(deriveAlerts([redm], BEFORE_DUE)).toEqual([
      { kind: "escrowShort", action: redm },
    ]);
  });

  it("stays quiet once the escrow holds net+tax+principal", () => {
    const funded = { ...redm, escrowBalance: kzt("100487500") };
    expect(deriveAlerts([funded], AFTER_DUE)).toEqual([]);
  });

  it("plan 15 D4: past payment + grace with the escrow still short, anyone may declare the default", () => {
    expect(deriveAlerts([redm], AFTER_DUE)).toEqual([
      { kind: "escrowShort", action: redm },
      { kind: "overdueFunding", action: redm },
    ]);
    // a demo clock shortens the grace to one series day (120 s)
    expect(
      deriveAlerts([redm], new Date("2027-03-01T00:03:00+05:00"), 120),
    ).toEqual([
      { kind: "escrowShort", action: redm },
      { kind: "overdueFunding", action: redm },
    ]);
  });

  it("plan 15 D4/D6: a declared default and payouts with the paying agent each raise their alert", () => {
    const defaulted = {
      ...redm,
      status: "Defaulted" as const,
      defaultedAt: "2027-03-02T00:05:00+05:00",
    };
    const withAgent = { ...redm, status: "Settling" as const, bankPending: 2 };
    expect(deriveAlerts([defaulted], AFTER_DUE)).toEqual([
      { kind: "defaultedAlert", action: defaulted },
    ]);
    expect(deriveAlerts([withAgent], BEFORE_DUE)).toEqual([
      { kind: "bankPending", action: withAgent },
    ]);
  });
});
