import { describe, expect, it } from "vitest";
import type { ActionDTO, ActivityLike, EntitlementDTO } from "./api";
import { moneyFlowOf } from "./moneyFlow";

const kzt = (minor: string) => ({ minor, display: "", currency: "tKZT" });
const ent = (owner: string, units: string, net: string, tax: string, status: EntitlementDTO["status"]) =>
  ({ pda: `e-${owner}`, actionPda: "A", owner, units, gross: kzt(String(BigInt(net) + BigInt(tax))), tax: kzt(tax), net: kzt(net), principal: kzt("0"), status }) as EntitlementDTO;

describe("moneyFlowOf", () => {
  // The brief: 10 / 25 / 65 units × 50 ₸ → 500 / 1,250 / 3,250; the non-resident (65) pays 15 % tax.
  const ents = [
    ent("A1", "10", "50000", "0", "Paid"),
    ent("B2", "25", "125000", "0", "Paid"),
    ent("C3", "65", "276250", "48750", "Snapshotted"),
  ];
  const activity = [
    { id: 1, ts: 1, kind: "ActionFunded", sig: "FUND", actionPda: "A" },
    { id: 2, ts: 2, kind: "EntitlementPaid", sig: "PAYA", actionPda: "A", payload: { owner: "A1" } },
    { id: 3, ts: 3, kind: "EntitlementPaid", sig: "PAYB", actionPda: "A", payload: { owner: "B2" } },
  ] as ActivityLike[];
  const action = (status: string, balance: string) =>
    ({ pda: "A", status, escrowBalance: kzt(balance), escrow: "ESC", perUnitGross: kzt("5000"), totalNet: kzt("451250") }) as unknown as ActionDTO;

  it("requires Σ net + tax, adds a tax-vault leg and keeps per-holder tx", () => {
    const f = moneyFlowOf(action("Settling", "325000"), ents, activity, (u) => `${u} bonds`);
    expect(f.escrow.required).toBe("500000");
    // funded once: a drained escrow still reads as fully funded
    expect(f.escrow.funded).toBe("500000");
    expect(f.escrow.fundTx).toBe("FUND");
    expect(f.recipients.map((r) => [r.kind, r.amount, r.status, r.tx])).toEqual([
      ["holder", "50000", "paid", "PAYA"],
      ["holder", "125000", "paid", "PAYB"],
      ["holder", "276250", "pending", null],
      ["tax", "48750", "pending", null],
    ]);
  });

  it("before funding, shows the escrow balance as is", () => {
    const f = moneyFlowOf(action("SnapshotComplete", "100000"), ents, [], (u) => u);
    expect(f.escrow.funded).toBe("100000");
    expect(f.escrow.fundTx).toBeNull();
  });
});
