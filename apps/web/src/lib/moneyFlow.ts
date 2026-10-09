/**
 * API DTOs → MoneyFlow props (components/ui/MoneyFlow): one leg per holder (net + principal), one for the tax vault
 * (Σ tax), funding from the escrow balance or, once paid out, from what the escrow had to hold.
 */
import type { FlowRecipient, MoneyFlowProps } from "@/components/ui/MoneyFlow";
import { paidTxByOwner } from "./actionFlow";
import type { ActionDTO, ActivityLike, EntitlementDTO } from "./api";
import { shortKey } from "./format";

/** Statuses in which the escrow has been fully funded at some point (it may since have paid out). */
const FUNDED = ["Funded", "Settling", "Completed", "Retiring"];

export function moneyFlowOf(
  action: ActionDTO,
  entitlements: EntitlementDTO[],
  activity: ActivityLike[],
  unitsLabel: (units: string) => string,
): Pick<MoneyFlowProps, "currency" | "escrow" | "recipients"> {
  const paidTx = paidTxByOwner(activity, action.pda);
  let tax = 0n;
  let required = 0n;
  let taxTx: string | null = null;
  let taxPaid = true;
  const recipients: FlowRecipient[] = entitlements.map((e) => {
    const net = BigInt(e.net?.minor ?? "0");
    const principal = BigInt(e.principal?.minor ?? "0");
    const t = BigInt(e.tax?.minor ?? "0");
    const paid = e.status === "Paid" || e.status === "Retired";
    tax += t;
    required += net + principal + t;
    if (t > 0n) {
      taxPaid &&= paid;
      taxTx ??= paidTx.get(e.owner) ?? null;
    }
    return {
      id: e.owner,
      kind: "holder",
      label: shortKey(e.owner),
      sub: unitsLabel(e.units),
      amount: (net + principal).toString(),
      status: paid ? "paid" : "pending",
      tx: paidTx.get(e.owner) ?? null,
    };
  });
  if (tax > 0n)
    recipients.push({
      id: "tax",
      kind: "tax",
      label: "tax",
      amount: tax.toString(),
      status: taxPaid ? "paid" : "pending",
      tx: taxTx,
    });
  const balance = BigInt(action.escrowBalance?.minor ?? "0");
  const funded = FUNDED.includes(action.status)
    ? balance > required
      ? balance
      : required
    : balance;
  const fundEv = activity
    .filter(
      (ev) =>
        ev.kind === "ActionFunded" &&
        (ev.actionPda ?? ev.action_pda) === action.pda,
    )
    .sort((a, b) => b.id - a.id)[0];
  return {
    currency: action.totalNet?.currency ?? action.perUnitGross.currency,
    escrow: {
      address: action.escrow ?? undefined,
      required: required.toString(),
      funded: funded.toString(),
      fundTx: fundEv?.sig ?? null,
    },
    recipients,
  };
}
