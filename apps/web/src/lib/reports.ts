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
  // Plan 15 D6: bank-routed payouts went to the paying agent; the bank transfer itself is SIMULATED.
  route?: "onchain" | "bank";
  bankPayoutTx?: string; // escrow → paying agent tx
  bankConfirmationTx?: string; // agent's confirmation tx ("" while awaiting)
  bankRefHash?: string; // sha256 hex of the transfer reference
};

/** The bank-route facts a statement row renders (plan 15): pure mapping, unit-tested. */
export type PayoutRouteView = {
  bank: boolean;
  confirmed: boolean; // the paying agent confirmed the SIMULATED transfer
  agentTx?: string;
  confirmTx?: string;
  refHash?: string;
};

export function payoutRouteView(
  p: Pick<
    PayoutRow,
    "route" | "status" | "bankPayoutTx" | "bankConfirmationTx" | "bankRefHash"
  >,
): PayoutRouteView {
  // A PaidToAgent row is bank-routed even if the feed rows that carry the txs were not ingested yet.
  const bank = p.route === "bank" || p.status === "PaidToAgent";
  if (!bank) return { bank: false, confirmed: false };
  return {
    bank: true,
    confirmed: Boolean(p.bankConfirmationTx),
    agentTx: p.bankPayoutTx || undefined,
    confirmTx: p.bankConfirmationTx || undefined,
    refHash: p.bankRefHash || undefined,
  };
}

/** Late-payout lateness split for i18n: 1800 → {h:0,m:30}, 5400 → {h:1,m:30}, none → null. */
export function formatLateSeconds(s: number): { h: number; m: number } | null {
  if (s <= 0) return null;
  const mins = Math.round(s / 60);
  return { h: Math.floor(mins / 60), m: mins % 60 };
}

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

/** Amount DTO of the registrar API (minor units + a display string). */
export type ActionAmount = { minor: string; display: string; currency: string };

/** Issuer payout report's per-action block (plan 15): required vs funded, the default and its cure, and
 * the bank-routed payout counts (bank transfers SIMULATED). Absent when no funding events were ingested. */
export type ActionSummary = {
  required: ActionAmount;
  funded: ActionAmount;
  defaultedAt: string;
  curedAt: string;
  lateSeconds: number;
  bankConfirmed: number;
  bankPending: number;
};
export type IssuerPayoutsReport = ReportMeta & {
  payouts: PayoutRow[];
  totals: PayoutTotals[];
  action?: ActionSummary | null;
};

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
  boFetch<IssuerPayoutsReport>(`/issuer/reports/payouts/${pda}`);
