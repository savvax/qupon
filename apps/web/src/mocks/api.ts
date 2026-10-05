/**
 * Demo fixtures + a tiny router so the UI can be built before the Go
 * registrar exists. Numbers follow the brief: QPNb1 1,000 KZT face, 10%
 * semi-annual, 3 holders with 10/25/65 units; BTRK-demo mirrors BTRKb33 in
 * USDC. Pubkeys are placeholders until real devnet mints land in
 * config/devnet.json.
 */
import type { ActionDTO, InvestorDTO, ScheduleItem, SeriesDTO } from "../lib/api";

const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const MINT_TKZT = "tKZTDeM0CashMint1111111111111111111111111111";
const MINT_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ACTION_PDA_1 = "ActnINTR0001Dem0PDA111111111111111111111111111";
const ESCROW_PDA_1 = "EscrowDem0PDA11111111111111111111111111111111";

const REGISTRAR = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
const ISSUER = "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma";
const PAYING_AGENT = "7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk";
const INVESTOR_OWNERS = [
  "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
  "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
  "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
];

const kzt = (minor: string, display: string) => ({ minor, display, currency: "tKZT" });
const usdc = (minor: string, display: string) => ({ minor, display, currency: "USDC" });
const explorer = (address: string) =>
  `https://explorer.solana.com/address/${address}?cluster=devnet`;

const series: SeriesDTO[] = [
  {
    mint: MINT_QPNB1,
    cashMint: MINT_TKZT,
    registrar: REGISTRAR,
    issuer: ISSUER,
    payingAgent: PAYING_AGENT,
    isin: "KZ2C0QUPON01",
    ticker: "QPNb1",
    faceValue: kzt("100000", "1,000.00 KZT"),
    couponRateBps: 1000,
    frequency: 2,
    dayCount: "THIRTY_360",
    issueDate: "2026-09-01",
    maturityDate: "2028-09-01",
    nextCouponDate: "2027-03-01T00:00:00+05:00",
    status: "Active",
    totalIssued: "100",
    quorumBps: 5000,
    approvalBps: 6667,
    openAction: ACTION_PDA_1,
    explorerUrl: explorer(MINT_QPNB1),
  },
  {
    mint: MINT_BTRK,
    cashMint: MINT_USDC,
    registrar: REGISTRAR,
    issuer: ISSUER,
    payingAgent: PAYING_AGENT,
    isin: "KZ2C00018703",
    ticker: "BTRKdemo",
    faceValue: usdc("1000000000", "1,000.00 USDC"),
    couponRateBps: 1595,
    frequency: 2,
    dayCount: "THIRTY_360",
    issueDate: "2026-09-15",
    maturityDate: "2031-09-15",
    nextCouponDate: "2027-03-15T00:00:00+05:00",
    status: "Active",
    totalIssued: "100",
    quorumBps: 5000,
    approvalBps: 6667,
    openAction: null,
    explorerUrl: explorer(MINT_BTRK),
  },
];

const investors = (mint: string, units: string[]): InvestorDTO[] =>
  units.map((u, i) => ({
    owner: INVESTOR_OWNERS[i] ?? INVESTOR_OWNERS[0]!,
    bondAta: `BoNdAtaDem0${mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    cashAta: `CaShAtaDem0${mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    units: u,
    status: "Active",
    explorerUrl: explorer(INVESTOR_OWNERS[i] ?? INVESTOR_OWNERS[0]!),
  }));

type Ymd = [number, number, number];

function addMonths([y, m, d]: Ymd, n: number): Ymd {
  const t = new Date(Date.UTC(y, m - 1 + n, d));
  return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
}

const pad = (n: number) => String(n).padStart(2, "0");
const day = (p: Ymd) => `${p[0]}-${pad(p[1])}-${pad(p[2])}`;
const almaty = (p: Ymd) => `${day(p)}T00:00:00+05:00`;

function couponSchedule(
  issue: Ymd,
  count: number,
  perUnit: { minor: string; display: string; currency: string },
  total: { minor: string; display: string; currency: string },
  announcedFirst = false,
): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  let periodStart = issue;
  for (let n = 1; n <= count; n++) {
    const payment = addMonths(issue, 6 * n);
    const record = addMonths(payment, 0); // start of the last day of the period
    items.push({
      couponNumber: n,
      periodStart: day(periodStart),
      periodEnd: day(record),
      recordDate: almaty(record),
      paymentDate: almaty(payment),
      amountPerUnit: perUnit,
      totalAmount: total,
      actionPda: announcedFirst && n === 1 ? ACTION_PDA_1 : null,
      status: announcedFirst && n === 1 ? "Announced" : "Projected",
    });
    periodStart = payment;
  }
  return items;
}

const actions: Record<string, ActionDTO[]> = {
  [MINT_QPNB1]: [
    {
      pda: ACTION_PDA_1,
      seriesMint: MINT_QPNB1,
      kind: "INTR",
      mandatory: "MAND",
      corpId: "QPNb1-INTR-0001",
      officialId: null,
      announcedAt: "2026-09-20T10:00:00+05:00",
      recordAt: "2027-02-28T00:00:00+05:00",
      paymentAt: "2027-03-01T00:00:00+05:00",
      periodStart: "2026-09-01",
      periodEnd: "2027-02-28",
      accrualDays: 180,
      rateBps: 1000,
      perUnitGross: kzt("5000", "50.00 KZT"),
      perUnitPrincipal: kzt("0", "0.00 KZT"),
      cashMint: MINT_TKZT,
      escrow: ESCROW_PDA_1,
      status: "Announced",
      snapshotSlot: null,
      snapshotHash: null,
      unitsSnapshotted: null,
      holdersSnapshotted: null,
      holdersPaid: null,
      totalGross: kzt("500000", "5,000.00 KZT"),
      totalTax: kzt("0", "0.00 KZT"),
      totalNet: kzt("500000", "5,000.00 KZT"),
      totalPaid: kzt("0", "0.00 KZT"),
      totalRetired: null,
      holdersRetired: null,
      proposalNewRateBps: null,
      proposalNewMaturity: null,
      votingEndsAt: null,
      votesFor: null,
      votesAgainst: null,
      votesAbstain: null,
      result: null,
      completedAt: null,
      factorBps: null,
      explorerUrl: explorer(ACTION_PDA_1),
    },
  ],
};

/** Serve one registrar API path from the fixtures above. */
export function mockGet(path: string): Promise<unknown> {
  const notFound = () => {
    throw new Api404(`series ${path} not found`);
  };
  const respond = (body: unknown) =>
    new Promise((resolve) => setTimeout(() => resolve(body), 30));

  if (path === "/series") return respond(series);
  const seriesMatch = /^\/series\/([^/]+)$/.exec(path);
  if (seriesMatch) {
    const found = series.find((s) => s.mint === seriesMatch[1]);
    return found ? respond(found) : Promise.reject(new Api404(`series ${seriesMatch[1]} not found`));
  }
  const subMatch = /^\/series\/([^/]+)\/(investors|schedule|actions)$/.exec(path);
  if (subMatch) {
    const mint = subMatch[1]!;
    const resource = subMatch[2]!;
    if (resource === "investors") {
      return respond(
        mint === MINT_QPNB1
          ? investors(mint, ["10", "25", "65"])
          : investors(mint, ["40", "30", "30"]),
      );
    }
    if (resource === "schedule") {
      return respond(
        mint === MINT_QPNB1
          ? couponSchedule(
              [2026, 9, 1],
              4,
              kzt("5000", "50.00 KZT"),
              kzt("500000", "5,000.00 KZT"),
              true,
            )
          : couponSchedule(
              [2026, 9, 15],
              10,
              usdc("79800", "79.80 USDC"),
              usdc("7980000", "7,980.00 USDC"),
            ),
      );
    }
    return respond(actions[mint] ?? []);
  }
  return Promise.reject(notFound());
}

export class Api404 extends Error {
  readonly code = "http_404";
  readonly status = 404;
}
