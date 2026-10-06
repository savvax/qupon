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

export type ReportMeta = { network: string; generatedAt: string; sources: string[] };

export type StatementReport = ReportMeta & { payouts: PayoutRow[]; totals: PayoutTotals[] };
export type TaxReport = StatementReport & { year: number };
export type HoldersReport = ReportMeta & { holders: HoldingRow[] };

/** "500.00" + " tKZT" from minor units (BigInt-exact through formatMinor). */
export function majorMinor(minor: number | string, decimals: number, currency?: string): string {
  const whole = Number(minor).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return currency ? `${whole} ${currency}` : whole;
}

/** Download URL of a report's CSV through the session proxy (same query as the JSON read). */
export function csvHref(path: string, query: Record<string, string | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v) q.set(k, v);
  q.set("format", "csv");
  return `/api/bo-get/${path}?${q}`;
}
