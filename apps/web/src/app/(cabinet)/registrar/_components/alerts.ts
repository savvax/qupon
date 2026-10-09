import type { ActionDTO } from "@/lib/api";

export type AlertKind = "recordDatePassed" | "escrowShort" | "cancelled";

export type ActionAlert = { kind: AlertKind; action: ActionDTO };

/** Conditions the registrar must react to (Plan 3 Task 3 alerts list). */
export function deriveAlerts(
  actions: ActionDTO[],
  now = new Date(),
): ActionAlert[] {
  const out: ActionAlert[] = [];
  for (const a of actions) {
    if (a.status === "Announced" && new Date(a.recordAt) < now)
      out.push({ kind: "recordDatePassed", action: a });
    // Required = Σ net + withheld tax + principal due (Underfunded checks the same sum;
    // perUnitPrincipal is 0 on coupons, so the product is a no-op there).
    if (
      a.status === "SnapshotComplete" &&
      a.escrowBalance &&
      a.totalNet &&
      a.totalTax
    ) {
      const principal =
        BigInt(a.perUnitPrincipal.minor) * BigInt(a.unitsSnapshotted ?? "0");
      const required =
        BigInt(a.totalNet.minor) + BigInt(a.totalTax.minor) + principal;
      if (BigInt(a.escrowBalance.minor) < required)
        out.push({ kind: "escrowShort", action: a });
    }
    if (a.status === "Cancelled") out.push({ kind: "cancelled", action: a });
  }
  return out;
}
