/** KASE market data (platform v2 §5.5, tasks 1001–1002): normalised public
 * endpoints GET /kase/bonds/{ticker}, /kase/news/{issuer}, /kase/series/{mint}.
 * Never a page dependency: callers catch and degrade. */
import { apiGet } from "@/lib/api";
import type { PreviewRow } from "@/lib/schedulePreview";
import { type Locale } from "@/i18n/locale";

export type KaseScheduleEntry = {
  recordDate: string;
  start: string;
  end: string;
  rate: number; // bps per year
};

export type KaseMarket = {
  price?: number | null; // % of nominal, clean
  bid?: number | null;
  offer?: number | null;
  volume?: number | null; // KZT
  date: string;
  lastDeals?: unknown;
};

export type KaseBond = {
  ticker: string;
  isin: string;
  issuer: string;
  issuerCode: string;
  currency: string;
  face: number; // minor units of the bond currency
  couponRate: number; // bps per year
  frequency: number; // per year, 0 = unknown
  dayCount?: "" | "THIRTY_360" | "ACT_365";
  issueDate: string;
  maturityDate: string;
  schedule: KaseScheduleEntry[];
  market: KaseMarket;
  stale: boolean;
  fetchedAt: string; // RFC3339
};

export type KaseNewsItem = {
  id: number;
  date: string;
  language: string;
  subject: string;
  body: string;
};

export type KaseNews = {
  issuer: string;
  lang: string;
  items: KaseNewsItem[];
  stale: boolean;
  fetchedAt: string;
};

export const getKaseBond = (ticker: string) =>
  apiGet<KaseBond>(`/kase/bonds/${ticker}`);

export const getKaseNews = (issuerCode: string, lang: Locale) =>
  apiGet<KaseNews>(`/kase/news/${issuerCode}?lang=${lang}`);

/** The linked KASE ticker of a series, or null when the series has none (404). */
export async function getKaseSeriesTicker(
  mint: string,
): Promise<string | null> {
  try {
    const { ticker } = await apiGet<{ ticker: string }>(`/kase/series/${mint}`);
    return ticker || null;
  } catch {
    return null; // 404 no_kase_ticker, or the registrar is unreachable: no panel
  }
}

export type KaseCompareRow = {
  n: number;
  kase?: KaseScheduleEntry; // absent when the preview has more periods than KASE lists
  preview?: PreviewRow; // absent when KASE lists more periods than the preview
  mismatch: boolean; // dates or rate differ from the wizard's terms
};

/**
 * Align KASE's coupon list with the wizard preview by period number. A row
 * matches when KASE's fixation falls inside the preview's period (KASE lists
 * payment periods that can be shifted or partial, e.g. a 2010 stub on
 * TEBNb10) and the KASE rate equals the wizard's annual rate; anything else
 * is a mismatch to highlight.
 */
export function compareKaseSchedule(
  kaseSchedule: KaseScheduleEntry[],
  preview: PreviewRow[],
  rateBps: number,
): KaseCompareRow[] {
  const rows: KaseCompareRow[] = [];
  for (let i = 0; i < Math.max(kaseSchedule.length, preview.length); i++) {
    const k = kaseSchedule[i];
    const p = preview[i];
    const inside =
      !!k && !!p && k.start >= p.periodStart && k.start <= p.periodEnd;
    const mismatch = !inside || (!!k && k.rate !== rateBps);
    rows.push({ n: i + 1, kase: k, preview: p, mismatch });
  }
  return rows;
}
