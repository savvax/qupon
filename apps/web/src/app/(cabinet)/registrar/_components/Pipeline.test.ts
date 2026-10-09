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

describe("deriveAlerts", () => {
  it("flags a redemption escrow that covers net+tax but not the principal", () => {
    expect(deriveAlerts([redm])).toEqual([
      { kind: "escrowShort", action: redm },
    ]);
  });

  it("stays quiet once the escrow holds net+tax+principal", () => {
    const funded = { ...redm, escrowBalance: kzt("100487500") };
    expect(deriveAlerts([funded])).toEqual([]);
  });
});
