/**
 * Display-side coupon arithmetic for the bond dossier (calculation drawer, accrued interest). The chain and
 * crates/entitlement are the source of truth; this re-derives their numbers so a reader can check them.
 * 30E/360 day count, half-up rounding per holder (AGENTS.md).
 */

/** 30E/360 days between two civil dates "YYYY-MM-DD" (day 31 counts as 30 on both ends). */
export function days30E360(start: string, end: string): number {
  const [y1, m1, d1] = start.slice(0, 10).split("-").map(Number) as [number, number, number];
  const [y2, m2, d2] = end.slice(0, 10).split("-").map(Number) as [number, number, number];
  return 360 * (y2 - y1) + 30 * (m2 - m1) + (Math.min(d2, 30) - Math.min(d1, 30));
}

/** round(num / den) half-up for non-negative integers. */
export const divHalfUp = (num: bigint, den: bigint): bigint => (num * 2n + den) / (2n * den);

/** Gross coupon for `units` bonds: units × face × rate × days / 360, in minor units, half-up once per holder. */
export function couponGross(
  units: bigint,
  faceMinor: bigint,
  rateBps: number,
  days: number,
): bigint {
  return divHalfUp(units * faceMinor * BigInt(rateBps) * BigInt(days), 360n * 10_000n);
}

/** Today's civil date in Almaty ("YYYY-MM-DD"). */
export const almatyToday = (now = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
