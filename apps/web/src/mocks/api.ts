/**
 * Demo fixtures + a tiny router so the UI can be built before the Go
 * registrar exists. Numbers follow the brief: QPNb1 1,000 KZT face, 10%
 * semi-annual, 3 holders with 10/25/65 units; BTRK-demo mirrors BTRKb33 in
 * USDC. Pubkeys are placeholders until real devnet mints land in
 * config/devnet.json.
 */
import type {
  ActionDTO,
  EntitlementDTO,
  InvestorDTO,
  ScheduleItem,
  SeriesDTO,
} from "../lib/api";

const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const MINT_TKZT = "tKZTDeM0CashMint1111111111111111111111111111";
const MINT_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ACTION_PDA_1 = "ActnINTR0001Dem0PDA111111111111111111111111111";
const ACTION_PDA_2 = "ActnBMET0002Dem0PDA1111111111111111111111111111";
const ESCROW_PDA_1 = "EscrowDem0PDA11111111111111111111111111111111";

const REGISTRAR = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
const ISSUER = "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma";
const PAYING_AGENT = "7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk";
const INVESTOR_OWNERS = [
  "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
  "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
  "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
];

const kzt = (minor: string, display: string) => ({
  minor,
  display,
  currency: "tKZT",
});
const usdc = (minor: string, display: string) => ({
  minor,
  display,
  currency: "USDC",
});
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
      escrowBalance: kzt("500000", "5,000.00 KZT"),
      status: "Completed",
      snapshotSlot: 1234,
      snapshotHash: "C7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
      unitsSnapshotted: "100",
      holdersSnapshotted: 3,
      holdersPaid: 3,
      totalGross: kzt("500000", "5,000.00 KZT"),
      totalTax: kzt("0", "0.00 KZT"),
      totalNet: kzt("500000", "5,000.00 KZT"),
      totalPaid: kzt("500000", "5,000.00 KZT"),
      totalRetired: null,
      holdersRetired: null,
      proposalNewRateBps: null,
      proposalNewMaturity: null,
      votingEndsAt: null,
      votesFor: null,
      votesAgainst: null,
      votesAbstain: null,
      result: null,
      completedAt: "2026-03-01T12:20:00+05:00",
      factorBps: null,
      explorerUrl: explorer(ACTION_PDA_1),
    },
    {
      pda: ACTION_PDA_2,
      seriesMint: MINT_QPNB1,
      kind: "BMET",
      mandatory: "VOLU",
      corpId: "QPNb1-BMET-0002",
      officialId: null,
      announcedAt: "2026-09-25T10:00:00+05:00",
      recordAt: "2026-09-26T00:00:00+05:00",
      paymentAt: "2026-09-26T00:00:00+05:00",
      periodStart: null,
      periodEnd: null,
      accrualDays: null,
      rateBps: null,
      perUnitGross: kzt("0", "0.00 KZT"),
      perUnitPrincipal: kzt("0", "0.00 KZT"),
      cashMint: MINT_TKZT,
      status: "VotingOpen",
      snapshotSlot: 1234,
      snapshotHash: null,
      unitsSnapshotted: "100",
      holdersSnapshotted: 3,
      holdersPaid: null,
      totalGross: kzt("0", "0.00 KZT"),
      totalTax: kzt("0", "0.00 KZT"),
      totalNet: kzt("0", "0.00 KZT"),
      totalPaid: kzt("0", "0.00 KZT"),
      totalRetired: null,
      holdersRetired: null,
      proposalNewRateBps: 1200,
      proposalNewMaturity: null,
      votingEndsAt: "2099-01-01T00:00:00+05:00",
      votesFor: null,
      votesAgainst: null,
      votesAbstain: null,
      result: null,
      completedAt: null,
      factorBps: null,
      explorerUrl: explorer(ACTION_PDA_2),
    },
  ],
};

/** Entitlements of an action: the brief's numbers (10/25/65 units → 500/1,250/3,250 KZT). */
const entitlements: Record<string, EntitlementDTO[]> = {
  [ACTION_PDA_1]: INVESTOR_OWNERS.map((owner, i) => {
    const gross = ["50000", "125000", "325000"][i] ?? "0";
    return {
      pda: `EnTlDem0Pda${i}For${ACTION_PDA_1.slice(0, 4)}1111111111111111111111111`,
      actionPda: ACTION_PDA_1,
      owner,
      units: ["10", "25", "65"][i] ?? "0",
      gross: kzt(gross, `${(Number(gross) / 100).toFixed(2)} KZT`),
      tax: kzt("0", "0.00 KZT"),
      net: kzt(gross, `${(Number(gross) / 100).toFixed(2)} KZT`),
      principal: kzt("0", "0.00 KZT"),
      status: "Paid",
      paidAt: "2026-03-01T12:00:00+05:00",
      vote: "None",
      votedAt: null,
      explorerUrl: explorer(owner),
    };
  }),
  [ACTION_PDA_2]: INVESTOR_OWNERS.map((owner, i) => ({
    pda: `EnTlDem0Pda${i}For${ACTION_PDA_2.slice(0, 4)}1111111111111111111111111`,
    actionPda: ACTION_PDA_2,
    owner,
    units: ["10", "25", "65"][i] ?? "0",
    gross: kzt("0", "0.00 KZT"),
    tax: kzt("0", "0.00 KZT"),
    net: kzt("0", "0.00 KZT"),
    principal: kzt("0", "0.00 KZT"),
    status: "Snapshotted",
    paidAt: null,
    vote: "None",
    votedAt: null,
    explorerUrl: explorer(owner),
  })),
};

/** Demo activity feed: a few events per action so the timeline shows tx links. */
const SIGS = [
  "2QDEmoSIGsxUZfxv9Wqmc7YHxzGVvXhWlLXkrxm9yuxJ4xJNuXkAepiYgLBaKq5YrTkNvWxTd1",
  "3Sp4jVLUu8FWeCJiKDA6mruYgRBMhJW9uCJdM2iNPvFrMdKaTrLoVe9nvCGdz9cAoPzVKYtu2",
  "4kJvYGz9cAoPzVKYtu2Sp4jVLUu8FWeCJiKDA6mruYgRBMhJW9uCJdM2iNPvFrMdKaTrLoVe9",
];

const ev = (
  id: number,
  ts: number,
  kind: string,
  actionPda: string,
  sig: string,
  payload: Record<string, unknown> = {},
) => ({
  id,
  ts,
  kind,
  sig,
  slot: 1234 + id,
  seq: 0,
  actionPda,
  seriesMint: MINT_QPNB1,
  payload,
});

const activity = [
  ev(1, 1771908000, "ActionAnnounced", ACTION_PDA_1, SIGS[0]!),
  { ...ev(2, 1771994400, "RecordStruck", ACTION_PDA_1, SIGS[1]!) },
  ev(3, 1771994700, "HolderSnapshotted", ACTION_PDA_1, SIGS[2]!, {
    owner: INVESTOR_OWNERS[0],
    units: "10",
  }),
  ev(4, 1771995000, "HolderSnapshotted", ACTION_PDA_1, SIGS[0]!, {
    owner: INVESTOR_OWNERS[1],
    units: "25",
  }),
  ev(5, 1771995300, "HolderSnapshotted", ACTION_PDA_1, SIGS[1]!, {
    owner: INVESTOR_OWNERS[2],
    units: "65",
  }),
  ev(6, 1771995600, "SnapshotFinalized", ACTION_PDA_1, SIGS[2]!),
  ev(7, 1772000000, "ActionFunded", ACTION_PDA_1, SIGS[0]!, {
    amount: "500000",
    escrow_balance: "500000",
    required: "500000",
    fully_funded: true,
  }),
  ev(8, 1772080800, "EntitlementPaid", ACTION_PDA_1, SIGS[1]!, {
    owner: INVESTOR_OWNERS[0],
    net: "50000",
  }),
  ev(9, 1772080801, "EntitlementPaid", ACTION_PDA_1, SIGS[2]!, {
    owner: INVESTOR_OWNERS[1],
    net: "125000",
  }),
  ev(10, 1772080802, "EntitlementPaid", ACTION_PDA_1, SIGS[0]!, {
    owner: INVESTOR_OWNERS[2],
    net: "325000",
  }),
  ev(11, 1772084400, "ActionCompleted", ACTION_PDA_1, SIGS[1]!, {
    series: MINT_QPNB1,
    kind: 0,
    holders_paid: 3,
    total_paid: "500000",
  }),
  ev(12, 1772150000, "ActionAnnounced", ACTION_PDA_2, SIGS[2]!),
  ev(13, 1772236400, "RecordStruck", ACTION_PDA_2, SIGS[0]!),
  ev(14, 1772240000, "SnapshotFinalized", ACTION_PDA_2, SIGS[1]!),
  ev(15, 1772300000, "VoteCast", ACTION_PDA_2, SIGS[2]!, {
    owner: INVESTOR_OWNERS[0],
    choice: 1,
    weight: "10",
  }),
];

/** Back-office fixtures (Plan 3 Task 5): operator audit trail + scheduler approvals. */
const nowSec = () => Math.floor(Date.now() / 1000);

const auditTrail = [
  {
    id: 3,
    ts: nowSec() - 3_600,
    userId: 1,
    role: "registrar",
    route: "POST /registrar/actions/" + ACTION_PDA_1 + "/advance",
    params: { pda: ACTION_PDA_1, confirm: true },
    ok: true,
    detail: "snapshot_batch",
    signatures: [SIGS[0]],
  },
  {
    id: 2,
    ts: nowSec() - 86_400,
    userId: 1,
    role: "registrar",
    route: "POST /registrar/investors",
    params: {
      series: MINT_QPNB1,
      owner: INVESTOR_OWNERS[0],
      investorType: "individual",
      residency: "resident",
      taxBps: 1000,
    },
    ok: true,
    detail: "onboard",
    signatures: [SIGS[1], SIGS[2]],
  },
  {
    id: 1,
    ts: nowSec() - 172_800,
    userId: 2,
    role: "issuer",
    route: "POST /issuer/series",
    params: { name: "QPNb1", isin: "KZ2C0QUPON01" },
    ok: false,
    detail: "series_exists",
    signatures: [],
  },
];

const approvals = [
  {
    id: 1,
    ts: nowSec() - 1_800,
    dedupKey: "QPNb1:INTR:1:strike_record",
    seriesMint: MINT_QPNB1,
    actionPda: ACTION_PDA_1,
    step: "step:strike_record",
    args: [
      "--json",
      "action:advance",
      "--series",
      "QPNb1",
      "--index",
      "1",
      "--step",
      "strike_record",
    ],
    status: "pending",
  },
  {
    id: 2,
    ts: nowSec() - 43_200,
    dedupKey: "QPNb1:INTR:1:snapshot_batch",
    seriesMint: MINT_QPNB1,
    actionPda: ACTION_PDA_1,
    step: "step:snapshot_batch",
    args: [
      "--json",
      "action:advance",
      "--series",
      "QPNb1",
      "--index",
      "1",
      "--step",
      "snapshot_batch",
    ],
    status: "executed",
    detail: { ok: true, signature: SIGS[2], slot: 1234 },
  },
];

function mockReconcile(pda: string) {
  const ents = entitlements[pda] ?? [];
  const ok = pda !== ACTION_PDA_2; // meetings reconcile against snapshot weights
  return {
    actionPda: pda,
    actionStatus: ok ? "Completed" : "VotingOpen",
    ok,
    holders: ents.length,
    mismatches: [],
    expectedHash: "C7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
    onchainHash: "C7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
    hashMatches: true,
    supply: 100,
    unitsSnapshotted: 100,
    totalsMatch: ok,
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

const delay = <T>(body: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(body), 30));

/** Serve one registrar API path from the fixtures above. */
export function mockGet(path: string): Promise<unknown> {
  const notFound = () => {
    throw new Api404(`series ${path} not found`);
  };

  if (path === "/series") return delay(series);
  if (path.startsWith("/activity")) return delay(activity);
  if (path.startsWith("/registrar/audit")) return delay({ items: auditTrail });
  if (path.startsWith("/approvals")) {
    const want = path.includes("executed") ? "executed" : "pending";
    return delay({ approvals: approvals.filter((a) => a.status === want) });
  }
  const reconcileMatch = /^\/actions\/([^/]+)\/reconcile$/.exec(path);
  if (reconcileMatch) {
    return delay(mockReconcile(reconcileMatch[1]!));
  }
  const seriesMatch = /^\/series\/([^/]+)$/.exec(path);
  if (seriesMatch) {
    const found = series.find((s) => s.mint === seriesMatch[1]);
    return found
      ? delay(found)
      : Promise.reject(new Api404(`series ${seriesMatch[1]} not found`));
  }
  const subMatch = /^\/series\/([^/]+)\/(investors|schedule|actions)$/.exec(
    path,
  );
  if (subMatch) {
    const mint = subMatch[1]!;
    const resource = subMatch[2]!;
    if (resource === "investors") {
      return delay(
        mint === MINT_QPNB1
          ? investors(mint, ["10", "25", "65"])
          : investors(mint, ["40", "30", "30"]),
      );
    }
    if (resource === "schedule") {
      return delay(
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
    return delay(actions[mint] ?? []);
  }
  const entMatch = /^\/actions\/([^/]+)\/entitlements$/.exec(path);
  if (entMatch) {
    return delay(entitlements[entMatch[1]!] ?? []);
  }
  const actionMatch = /^\/actions\/([^/]+)$/.exec(path);
  if (actionMatch) {
    const found = Object.values(actions)
      .flat()
      .find((a) => a.pda === actionMatch[1]);
    return found
      ? delay(found)
      : Promise.reject(new Api404(`action ${actionMatch[1]} not found`));
  }
  return Promise.reject(notFound());
}

/** Plain-text fixture downloads (notice, ISO XML) for mock mode. */
export function mockGetText(path: string): Promise<string> {
  const noticeMatch = /^\/actions\/([^/]+)\/notice\?lang=(en|ru)$/.exec(path);
  if (noticeMatch) {
    const found = Object.values(actions)
      .flat()
      .find((a) => a.pda === noticeMatch[1]);
    if (!found)
      return Promise.reject(new Api404(`action ${noticeMatch[1]} not found`));
    const text =
      noticeMatch[2] === "ru"
        ? `УВЕДОМЛЕНИЕ (ДЕМО)\n${found.corpId} · процентный платёж · запись ${found.recordAt.slice(0, 10)}\nКУПОН: 10.00% · на единицу 50.00 KZT\nSIMULATED — публикация на kase.kz не подключена\n`
        : `NOTICE (DEMO)\n${found.corpId} · interest payment · record ${found.recordAt.slice(0, 10)}\nCOUPON: 10.00% · per unit 50.00 KZT\nSIMULATED — publication on kase.kz not integrated\n`;
    return delay(text);
  }
  if (path.endsWith(".xml")) {
    return delay(
      '<?xml version="1.0" encoding="UTF-8"?>\n<!-- seev mock (API_MOCKING=enabled) -->\n<Document>DEMO</Document>\n',
    );
  }
  return Promise.reject(new Api404(`text ${path} not found`));
}

export class Api404 extends Error {
  readonly code = "http_404";
  readonly status = 404;
}
