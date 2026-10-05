import type { SeriesRow } from "@/lib/portal";
import { estimateCoupon } from "@/lib/portal";

/** One money bucket per settlement currency (series in a portfolio may settle differently). */
export type CurrencyTotal = { currency: string; minor: bigint };

function add(list: CurrencyTotal[], currency: string, minor: bigint) {
  if (minor === 0n) return;
  const hit = list.find((t) => t.currency === currency);
  if (hit) hit.minor += minor;
  else list.push({ currency, minor });
}

/** Face value of everything held (units × face), grouped by currency. */
export function faceTotals(rows: SeriesRow[]): CurrencyTotal[] {
  const out: CurrencyTotal[] = [];
  for (const r of rows)
    if (r.me)
      add(
        out,
        r.series.faceValue.currency,
        BigInt(r.series.faceValue.minor) * BigInt(r.me.units),
      );
  return out;
}

/** Net cash of Paid entitlements (coupon + redemption principal), grouped by currency. */
export function receivedToDate(rows: SeriesRow[]): CurrencyTotal[] {
  const out: CurrencyTotal[] = [];
  for (const r of rows)
    for (const e of r.entitlements)
      if (e.status === "Paid")
        add(
          out,
          (e.net ?? e.gross)?.currency ?? r.series.faceValue.currency,
          BigInt((e.net ?? e.gross)?.minor ?? "0") +
            BigInt(e.principal?.minor ?? "0"),
        );
  return out;
}

/** Earliest coupon still to come across holdings, with the held-units gross estimate. */
export function nextPayment(
  rows: SeriesRow[],
): { date: string; est?: { currency: string; minor: bigint } } | undefined {
  let best:
    | { item: SeriesRow["schedule"][number]; time: number; row: SeriesRow }
    | undefined;
  for (const row of rows) {
    if (!row.me || row.series.status === "Closed") continue;
    for (const item of row.schedule) {
      if (item.status === "Completed") continue;
      const time = new Date(item.paymentDate).getTime();
      if (!Number.isFinite(time)) continue;
      if (!best || time < best.time) best = { item, time, row };
    }
  }
  if (!best) return undefined;
  const est = best.row.me
    ? estimateCoupon(best.row.series, best.row.me.units, best.item)
    : undefined;
  return {
    date: best.item.paymentDate,
    est:
      est !== undefined
        ? { currency: best.row.series.faceValue.currency, minor: est }
        : undefined,
  };
}
