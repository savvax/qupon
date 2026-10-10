import { defaultOverdue, fundingShortfall } from "@/lib/actionFlow";
import type { ActionDTO } from "@/lib/api";

export type AlertKind =
  | "recordDatePassed"
  | "escrowShort"
  | "overdueFunding"
  | "defaultedAlert"
  | "bankPending"
  | "cancelled";

export type ActionAlert = { kind: AlertKind; action: ActionDTO };

/** Alert tone: red needs a reaction now, amber is early warning, bank-blue waits on the agent. */
export const ALERT_TONE: Record<AlertKind, "danger" | "warn" | "bank" | "neutral"> = {
  overdueFunding: "danger",
  defaultedAlert: "danger",
  escrowShort: "warn",
  recordDatePassed: "warn",
  bankPending: "bank",
  cancelled: "neutral",
};

/**
 * Conditions the registrar must react to (Plan 3 Task 3 alerts list + plan 15: default/overdue funding D4
 * and bank payouts awaiting the paying agent D6).
 */
export function deriveAlerts(
  actions: ActionDTO[],
  now = new Date(),
  /** one series day in seconds on a demo clock — the default grace (D4); all series share it here */
  graceSecs = 86_400,
): ActionAlert[] {
  const out: ActionAlert[] = [];
  for (const a of actions) {
    if (a.status === "Announced" && new Date(a.recordAt) < now)
      out.push({ kind: "recordDatePassed", action: a });
    // Required = Σ net + withheld tax + principal due (Underfunded checks the same sum).
    const short =
      a.status === "SnapshotComplete" || a.status === "Defaulted"
        ? fundingShortfall(a)
        : null;
    if (a.status === "SnapshotComplete") {
      if (short && short > 0n) out.push({ kind: "escrowShort", action: a });
      // past the payment date + grace with the escrow still short: any wallet may record the default
      if (defaultOverdue(a, now.getTime(), graceSecs))
        out.push({ kind: "overdueFunding", action: a });
    }
    if (a.status === "Defaulted") out.push({ kind: "defaultedAlert", action: a });
    if ((a.bankPending ?? 0) > 0) out.push({ kind: "bankPending", action: a });
    if (a.status === "Cancelled") out.push({ kind: "cancelled", action: a });
  }
  return out;
}
