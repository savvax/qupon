/**
 * Public holder lookup (plan 15 task 1533, backend task 1525): `GET /holders/{owner}` answers where any wallet's
 * bonds and payouts stand — positions with the payout route each holder chose, entitlements with gross/tax/net and
 * the paying tx, and the next record/payment dates per series through the series clock.
 */
import {
  type HolderLookupDTO,
  type UpcomingPayoutDTO,
  apiGet,
  type Schemas,
} from "./api";

export type HolderLookup = HolderLookupDTO;
export type HolderPosition = Schemas["HolderPositionDTO"];
export type HolderEntitlement = Schemas["HolderEntitlementDTO"];
export type UpcomingPayout = UpcomingPayoutDTO;

/** One holder's cross-series slice; cached 15 s by the registrar. */
export const getHolder = (owner: string) =>
  apiGet<HolderLookup>(`/holders/${owner}`);

/** One calendar month: the payouts whose record or payment date falls inside it. */
export interface CalendarMonth {
  /** "YYYY-MM" — Almaty civil month */
  key: string;
  events: {
    payout: UpcomingPayout;
    date: string;
    kind: "record" | "payment";
  }[];
}

/**
 * The payout calendar: the next 12 civil months (Almaty) from `now`, each carrying the record/payment dates of the
 * holder's upcoming payouts. Months without events stay in the grid — a calendar shows time, not only events.
 */
export function payoutCalendar(
  upcoming: UpcomingPayout[],
  now = new Date(),
  months = 12,
): CalendarMonth[] {
  const keys: string[] = [];
  for (let i = 0; i < months; i++) {
    // Almaty = UTC+5: shifting by +5 h before reading UTC fields keeps month buckets civil.
    const d = new Date(now.getTime() + 5 * 3600_000);
    d.setUTCMonth(d.getUTCMonth() + i);
    keys.push(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
    );
  }
  const byKey = new Map(keys.map((k) => [k, [] as CalendarMonth["events"]]));
  for (const p of upcoming) {
    for (const [field, kind] of [
      [p.recordAt, "record"],
      [p.paymentAt, "payment"],
    ] as const) {
      const key = field.slice(0, 7); // "YYYY-MM" of the ISO 8601 +05:00 timestamp
      byKey.get(key)?.push({ payout: p, date: field, kind });
    }
  }
  return keys.map((key) => ({ key, events: byKey.get(key) ?? [] }));
}
