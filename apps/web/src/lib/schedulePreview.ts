/** Client-side preview of a new series' coupon schedule (the chain recomputes it; this is for the wizard). */

export type DayCountId = "THIRTY_360" | "ACT_365";
export type PreviewTerms = {
  faceMinor: bigint;
  rateBps: number;
  frequency: 1 | 2 | 4 | 12;
  dayCount: DayCountId;
  issueDate: string;
  maturityDate: string;
};
export type PreviewRow = {
  n: number;
  periodStart: string;
  periodEnd: string;
  perUnitMinor: bigint;
};

const daysIn = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** YYYY-MM-DD + months, clamping the day to the month's end (crates/entitlement `Ymd::add_months`). */
export function addMonthsYmd(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysIn(ny, nm));
  return `${ny}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

const dayNumber = (ymd: string) =>
  Date.UTC(...(ymd.split("-").map(Number) as [number, number, number])) /
  86_400_000;
const halfUp = (num: bigint, den: bigint) => (num * 2n + den) / (den * 2n);

/**
 * Coupon periods from the issue date: the k-th period ends at issue + k × 12/frequency months (computed from the
 * issue date each time, never by stepping, so month-end clamping does not drift). 30E/360 pays rate/frequency of
 * face per period; ACT/365 pays face × rate × days / 365. Per-unit amounts round half-up.
 */
export function schedulePreview(t: PreviewTerms): PreviewRow[] {
  const step = 12 / t.frequency;
  const rows: PreviewRow[] = [];
  let start = t.issueDate;
  for (let k = 1; k <= 1200; k++) {
    const end = addMonthsYmd(t.issueDate, k * step);
    if (end > t.maturityDate) break;
    const per =
      t.dayCount === "THIRTY_360"
        ? halfUp(t.faceMinor * BigInt(t.rateBps), 10_000n * BigInt(t.frequency))
        : halfUp(
            t.faceMinor *
              BigInt(t.rateBps) *
              BigInt(dayNumber(end) - dayNumber(start)),
            10_000n * 365n,
          );
    rows.push({ n: k, periodStart: start, periodEnd: end, perUnitMinor: per });
    start = end;
  }
  return rows;
}

/** "1 000,50" → minor units with `decimals` places; undefined for junk, zero or too many decimals. */
export function parseMajor(
  input: string,
  decimals: number,
): bigint | undefined {
  const s = input.replace(/[\s ]/g, "").replace(",", ".");
  const m = /^(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m || (m[2]?.length ?? 0) > decimals) return undefined;
  const v =
    BigInt(m[1]!) * 10n ** BigInt(decimals) +
    BigInt((m[2] ?? "").padEnd(decimals, "0") || "0");
  return v > 0n ? v : undefined;
}

/** "10" / "15,95" (percent) → bps in 1..10000; undefined otherwise. */
export function parseRateBps(input: string): number | undefined {
  const v = parseMajor(input, 2);
  return v !== undefined && v <= 10_000n ? Number(v) : undefined;
}
