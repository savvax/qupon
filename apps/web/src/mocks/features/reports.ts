import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the `reports` feature (platform v2 §5.4, tasks 901/902). Numbers follow the brief:
 * QPNb1 1,000 KZT face, 10% semi-annual, holders 10/25/65 units → coupons 500/1,250/3,250 KZT; the
 * redemption pays 10,000 KZT principal for the first holder's 10 units. The mock member's wallet
 * (mocks/features/account.ts) is the first owner, so statement/tax show that holder's rows.
 */
const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const ACTION_PDA_1 = "ActnINTR0001Dem0PDA111111111111111111111111111";
const ACTION_PDA_2 = "ActnINTR0002Dem0PDA111111111111111111111111111";
const ACTION_PDA_REDM = "ActnREDM0004Dem0PDA111111111111111111111111111";

// Plan-15 story (task 91544): a bank-routed payout and its confirmation, plus a default cured 30 min late.
const BANK_AGENT_TX =
  "5UpRq2vXnMczD8KbGFtQmJ4hWjAeZyLpVnS7dRgKfCuBqM9xT2vHnE3wAsYd6LpTfGhJ5kWrXnZ8mBvC4qLd7SgNh";
const BANK_CONFIRM_TX =
  "3FgKq7YtNmBvCeHrXzLwPdJcAoSbUiTnEqWmZxKvCuBgSd8HpN6rTyFjMhLdGsAweRoKiUyTrEwqZnXvB4mLp2hKf";
const BANK_REF_HASH =
  "c7f4a9e21b0d8356fa92f1e7b04d6c8a5e3f29d170b48ac6de95f2b7130ad84e";

const OWNERS = [
  "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
  "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
  "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
];

const NETWORK = "devnet";
const GENERATED = "2026-10-06T12:00:00+05:00";

type Payout = {
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
  // Plan 15 D6: bank-routed payouts went to the paying agent; the bank transfer itself is SIMULATED.
  route?: "onchain" | "bank";
  bankPayoutTx?: string;
  bankConfirmationTx?: string;
  bankRefHash?: string;
  currency: string;
  decimals: number;
};

const coupon = (i: number): Payout => {
  const gross = [50000, 125000, 325000][i] ?? 0;
  const tax = i === 2 ? Math.round(gross * 0.15) : 0;
  return {
    series: "QPNb1",
    isin: "KZ2C0QUPON01",
    kind: "INTR",
    corpId: "QPNb1-INTR-0001",
    action: ACTION_PDA_1,
    owner: OWNERS[i] ?? OWNERS[0]!,
    recordDate: "2026-02-28",
    paymentDate: "2026-03-01",
    paidAt: "2026-03-01T12:00:00+05:00",
    units: [10, 25, 65][i] ?? 0,
    gross,
    tax,
    net: gross - tax,
    principal: 0,
    status: "Paid",
    // The 65-unit non-resident holder chose the bank route (plan 15): paid to the paying agent and confirmed.
    ...(i === 2 && {
      route: "bank" as const,
      bankPayoutTx: BANK_AGENT_TX,
      bankConfirmationTx: BANK_CONFIRM_TX,
      bankRefHash: BANK_REF_HASH,
    }),
    currency: "tKZT",
    decimals: 2,
  };
};

/** Redemption of the first holder's 10 units: 10 × 1,000 KZT face = 10,000 KZT principal. */
const redemption: Payout = {
  series: "QPNb1",
  isin: "KZ2C0QUPON01",
  kind: "REDM",
  corpId: "QPNb1-REDM-0004",
  action: ACTION_PDA_REDM,
  owner: OWNERS[0]!,
  recordDate: "2028-08-31",
  paymentDate: "2028-09-01",
  paidAt: "2028-09-01T12:00:00+05:00",
  units: 10,
  gross: 0,
  tax: 0,
  net: 0,
  principal: 1_000_000,
  status: "Paid",
  currency: "tKZT",
  decimals: 2,
};

const sum = (ps: Payout[]) => {
  const by = new Map<
    string,
    {
      n: number;
      gross: number;
      tax: number;
      net: number;
      principal: number;
      decimals: number;
    }
  >();
  for (const p of ps) {
    const a = by.get(p.currency) ?? {
      n: 0,
      gross: 0,
      tax: 0,
      net: 0,
      principal: 0,
      decimals: p.decimals,
    };
    a.n++;
    a.gross += p.gross;
    a.tax += p.tax;
    a.net += p.net;
    a.principal += p.principal;
    by.set(p.currency, a);
  }
  const major = (v: number, d: number) => (v / 10 ** d).toFixed(d);
  return [...by.entries()].map(([currency, a]) => ({
    currency,
    payouts: a.n,
    gross: major(a.gross, a.decimals),
    tax: major(a.tax, a.decimals),
    net: major(a.net, a.decimals),
    principal: major(a.principal, a.decimals),
  }));
};

/** All payouts that touch the mock member's wallets (first owner). */
const memberPayouts: Payout[] = [
  coupon(0),
  redemption,
  // Plan 15: the member's next coupon chose the bank route — paid to the agent, awaiting the SIMULATED
  // bank transfer's confirmation.
  {
    series: "QPNb1",
    isin: "KZ2C0QUPON01",
    kind: "INTR",
    corpId: "QPNb1-INTR-0002",
    action: ACTION_PDA_2,
    owner: OWNERS[0]!,
    recordDate: "2026-08-31",
    paymentDate: "2026-09-01",
    paidAt: "2026-09-01T12:00:00+05:00",
    units: 10,
    gross: 50000,
    tax: 0,
    net: 50000,
    principal: 0,
    status: "PaidToAgent",
    route: "bank",
    bankPayoutTx: BANK_AGENT_TX,
    currency: "tKZT",
    decimals: 2,
  },
];

const holders = (units: number[]) =>
  units.map((units, i) => ({
    series: "QPNb1",
    isin: "KZ2C0QUPON01",
    owner: OWNERS[i] ?? OWNERS[0]!,
    units,
    investorType: i === 1 ? "legal_entity" : "individual",
    residency: i === 2 ? "nonresident" : "resident",
    taxBps: i === 2 ? 1500 : 0,
    status: "Active",
    kycRef: `KycAttestPda${i}111111111111111111111111111111`,
  }));

const major = (v: number, d: number) => (v / 10 ** d).toFixed(d);

const cell = (v: string | number) =>
  /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);

/** Same shape as the Go CSV (reports.WriteCSV): BOM, header, rows, "# key,value" metadata. */
const csv = (
  header: string[],
  rows: (string | number)[][],
  meta: [string, string][],
) =>
  "\ufeff" +
  [header, ...rows, ...meta.map(([k, v]) => ["# " + k, v])]
    .map((r) => r.map(cell).join(","))
    .join("\n") +
  "\n";

const PAYOUT_HEADER = [
  "payment_date",
  "series",
  "isin",
  "kind",
  "corp_id",
  "owner",
  "units",
  "gross",
  "tax_withheld",
  "net",
  "principal",
  "currency",
  "status",
  "route",
  "paid_at",
  "bank_confirmation_tx",
  "action",
];

const payoutRows = (ps: Payout[]) =>
  ps.map((p) => [
    p.paymentDate,
    p.series,
    p.isin,
    p.kind,
    p.corpId,
    p.owner,
    p.units,
    major(p.gross, p.decimals),
    major(p.tax, p.decimals),
    major(p.net, p.decimals),
    major(p.principal, p.decimals),
    p.currency,
    p.status,
    p.route ?? "onchain",
    p.paidAt,
    p.bankConfirmationTx ?? "",
    p.action,
  ]);

const meta = (report: string, sources: string[]): [string, string][] => [
  ["report", report],
  ["network", NETWORK],
  ["generated_at", GENERATED],
  ...sources.map((s) => ["source", s] as [string, string]),
];

const isCsv = (query: URLSearchParams) => query.get("format") === "csv";

const OWNERS_LIST = OWNERS.join(",");

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/me\/reports\/statement$/,
    reply: (_m, _body, query) => {
      const from = query.get("from") ?? "";
      const to = query.get("to") ?? "";
      const ps = memberPayouts.filter(
        (p) => (!from || p.paymentDate >= from) && (!to || p.paymentDate <= to),
      );
      if (isCsv(query))
        return csv(
          PAYOUT_HEADER,
          payoutRows(ps),
          meta("statement", [OWNERS[0]!]),
        );
      return {
        payouts: ps,
        totals: sum(ps),
        network: NETWORK,
        generatedAt: GENERATED,
        sources: [OWNERS[0]!],
      };
    },
  },
  {
    method: "GET",
    path: /^\/me\/reports\/tax$/,
    reply: (_m, _body, query) => {
      const year = Number(query.get("year") ?? new Date().getFullYear());
      const ps = memberPayouts.filter(
        (p) => p.status === "Paid" && p.paidAt.startsWith(String(year)),
      );
      if (isCsv(query))
        return csv(
          PAYOUT_HEADER,
          payoutRows(ps),
          meta(`tax-${year}`, [OWNERS[0]!]),
        );
      return {
        year,
        payouts: ps,
        totals: sum(ps),
        network: NETWORK,
        generatedAt: GENERATED,
        sources: [OWNERS[0]!],
      };
    },
  },
  {
    method: "GET",
    path: /^\/registrar\/reports\/holders\/([^/]+)$/,
    reply: (m, _body, query) => {
      const hs = holders(m[1] === BTRK ? [40, 30, 30] : [10, 25, 65]);
      if (isCsv(query)) {
        return csv(
          [
            "series",
            "isin",
            "owner",
            "units",
            "investor_type",
            "residency",
            "tax_bps",
            "status",
            "kyc_ref",
          ],
          hs.map((h) => [
            h.series,
            h.isin,
            h.owner,
            h.units,
            h.investorType,
            h.residency,
            h.taxBps,
            h.status,
            h.kycRef,
          ]),
          meta(`holders-QPNb1`, [m[1]!, QPNB1]),
        );
      }
      return {
        holders: hs,
        network: NETWORK,
        generatedAt: GENERATED,
        sources: [m[1]!],
      };
    },
  },
  {
    method: "GET",
    path: /^\/issuer\/reports\/payouts\/([^/]+)$/,
    reply: (m, _body, query) => {
      const ps: Payout[] =
        m[1] === ACTION_PDA_REDM
          ? [redemption]
          : [coupon(0), coupon(1), coupon(2)];
      if (isCsv(query))
        return csv(
          PAYOUT_HEADER,
          payoutRows(ps),
          meta("payouts-QPNb1-INTR-0001", [m[1]!]),
        );
      return {
        payouts: ps,
        totals: sum(ps),
        // Plan-15 settlement story (brief numbers: coupons 500+1,250+3,250 = 5,000 KZT): funded in full
        // after a default cured 30 minutes late; one bank-routed payout confirmed.
        ...(m[1] !== ACTION_PDA_REDM && {
          action: {
            required: {
              minor: "500000",
              display: "5000.00 tKZT",
              currency: "tKZT",
            },
            funded: {
              minor: "500000",
              display: "5000.00 tKZT",
              currency: "tKZT",
            },
            defaultedAt: "2026-03-01T12:30:00+05:00",
            curedAt: "2026-03-01T13:00:00+05:00",
            lateSeconds: 1800,
            bankConfirmed: 1,
            bankPending: 0,
          },
        }),
        network: NETWORK,
        generatedAt: GENERATED,
        sources: [m[1]!],
      };
    },
  },
];

/** Exposed for e2e assertions: the wallets the mock statement covers. */
export const MOCK_STATEMENT_OWNERS = OWNERS_LIST;
