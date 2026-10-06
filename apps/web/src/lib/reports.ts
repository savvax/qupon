import { boFetch } from "@/lib/bo";
import { formatMinor } from "@/lib/format";

/** Report DTOs of the platform v2 report endpoints (task 901) — amounts in minor units of `currency`. */
export type PayoutRow = {
  series: string;
  isin: string;
  kind: string;
  corpId: string;
  action: string;
  owner: string;
  recordDate: string;
  paymentDate: string;
  paidAt: string;
  units: number;
  gross: number;
  tax: number;
  net: number;
  principal: number;
  status: string;
  currency: string;
  decimals: number;
};

export type PayoutTotals = {
  currency: string;
  payouts: number;
  gross: string; // major units
  tax: string;
  net: string;
  principal: string;
};

export type HoldingRow = {
  series: string;
  isin: string;
  owner: string;
  units: number;
  investorType: string;
  residency: string;
  taxBps: number;
  status: string;
  kycRef: string;
};

export type ReportMeta = {
  network: string;
  generatedAt: string;
  sources: string[];
};

export type StatementReport = ReportMeta & {
  payouts: PayoutRow[];
  totals: PayoutTotals[];
};
export type TaxReport = StatementReport & { year: number };
export type HoldersReport = ReportMeta & { holders: HoldingRow[] };

const qs = (query: Record<string, string | number | undefined>) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query))
    if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
};

/** "500.00" + " tKZT" from minor units (BigInt-exact through formatMinor). */
export function majorMinor(
  minor: number | string,
  decimals: number,
  currency?: string,
): string {
  const major = formatMinor(String(minor), decimals);
  return currency ? `${major} ${currency}` : major;
}

/** Download URL of a report's CSV through the session proxy (same query as the JSON read). */
export function csvHref(
  path: string,
  query: Record<string, string | number | undefined>,
): string {
  return `/api/bo-get/${path}${qs({ ...query, format: "csv" })}`;
}

/** URL of the printable HTML view of a report (statement | tax | holders | payouts). */
export function printHref(
  report: string,
  query: Record<string, string | number | undefined>,
): string {
  return `/print/${report}${qs(query)}`;
}

export const getStatement = (from?: string, to?: string) =>
  boFetch<StatementReport>(`/me/reports/statement${qs({ from, to })}`);

export const getTax = (year: number) =>
  boFetch<TaxReport>(`/me/reports/tax${qs({ year })}`);

export const getHolders = (mint: string) =>
  boFetch<HoldersReport>(`/registrar/reports/holders/${mint}`);

export const getPayouts = (pda: string) =>
  boFetch<StatementReport>(`/issuer/reports/payouts/${pda}`);
