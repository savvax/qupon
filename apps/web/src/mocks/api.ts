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
import { featureMock } from "./features";
import { openTradesOf } from "./features/trades";

const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const MINT_TKZT = "BYPKzbKvf1up8iJSjx21gS87YwzLKH7gdq5uLJUHZia4"; // valid base58 (task 9700)
const MINT_USDC = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
const ACTION_PDA_1 = "ActnINTR0001Dem0PDA111111111111111111111111111";
const ACTION_PDA_2 = "ActnBMET0002Dem0PDA1111111111111111111111111111";
const ACTION_PDA_3 = "ActnINTR0003Dem0PDA111111111111111111111111111";
// Plan 15 task 1533: a funded BTRK coupon drives the Claim buttons and the claimable KPI in mock mode.
const ACTION_PDA_4 = "ActnINTR0004Dem0PDA111111111111111111111111111";
// Plan 15 task 1534: the registrar console v2 fixtures — a defaulted coupon (D4) and a redemption
// with bank-routed payouts (D6).
const ACTION_PDA_6 = "ActnINTR0006Dem0PDA111111111111111111111111111";
const ACTION_PDA_7 = "ActnREDM0007Dem0PDA111111111111111111111111111";
const ESCROW_PDA_1 = "EscrowDem0PDA11111111111111111111111111111111";
const ESCROW_PDA_2 = "EscrowDem0PDA22222222222222222222222222222222";

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

/** The showcase definitions the Go registrar seeds (internal/api/showcase.go); mock mirror. */
const SHOWCASE_SERIES = [
  {
    mint: "PwrAlmtDem0Mint11111111111111111111111111111",
    isin: "KZ2C0QPN0018",
    ticker: "Almaty Power",
    maturity: "2027-10-09",
    coupons: 2,
    actionPda: "ActnPWR0001Dem0PDA111111111111111111111111111",
  },
  {
    mint: "MtrAstnDem0Mint11111111111111111111111111111",
    isin: "KZ2C0QPN0026",
    ticker: "Astana Metro",
    maturity: "2027-04-09",
    coupons: 1,
    actionPda: "ActnMTR0002Dem0PDA111111111111111111111111111",
  },
  {
    mint: "MngAktbDem0Mint11111111111111111111111111111",
    isin: "KZ2C0QPN0034",
    ticker: "Aktobe Mining",
    maturity: "2027-07-09",
    coupons: 2,
    actionPda: "ActnMNG0003Dem0PDA111111111111111111111111111",
  },
  {
    mint: "OilAtryDem0Mint11111111111111111111111111111",
    isin: "KZ2C0QPN0042",
    ticker: "Atyrau Oil",
    maturity: "2027-06-09",
    coupons: 1,
    actionPda: "ActnOIL0004Dem0PDA111111111111111111111111111",
  },
] as const;

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
    openAction: null,
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
    openAction: ACTION_PDA_3,
    explorerUrl: explorer(MINT_BTRK),
  },
  // The curated showcase (task 1535): four demo series on the accelerated clock, one per scenario,
  // mirroring internal/api/showcase.go — the same tickers and ISINs task 1540 issues on devnet.
  ...SHOWCASE_SERIES.map((s): SeriesDTO => ({
    mint: s.mint,
    cashMint: MINT_TKZT,
    registrar: REGISTRAR,
    issuer: ISSUER,
    payingAgent: PAYING_AGENT,
    isin: s.isin,
    ticker: s.ticker,
    faceValue: kzt("100000", "1,000.00 KZT"),
    couponRateBps: 1000,
    frequency: 2 as const,
    dayCount: "THIRTY_360",
    issueDate: "2026-10-09",
    maturityDate: s.maturity,
    nextCouponDate: "2027-04-09T00:00:00+05:00",
    status: "Active",
    totalIssued: "100",
    quorumBps: 5000,
    approvalBps: 6667,
    openAction: s.actionPda,
    demoClock: { daySecs: 4, issueTs: 1_791_000_000, issueDate: "2026-10-09" },
    featured: true,
    explorerUrl: explorer(s.mint),
  })),
];

const investors = (mint: string, units: string[]): InvestorDTO[] =>
  units.map((u, i) => ({
    owner: INVESTOR_OWNERS[i] ?? INVESTOR_OWNERS[0]!,
    bondAta: `BoNdAtaDem0${mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    cashAta: `CaShAtaDem0${mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    units: u,
    investorType: i === 1 ? "legal_entity" : "individual",
    residency: i === 2 ? "nonresident" : "resident",
    taxRateBps: i === 2 ? 1500 : 0,
    kycRef: `KycAttestPda${i}111111111111111111111111111111`,
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
      completedAt: "2027-03-01T12:20:00+05:00",
      factorBps: null,
      // sha256 of the mock seev.031 XML (mockGetText) — the console's browser-side check shows ✓
      disclosureHash:
        "e69e6726894709998fb8a9c481c0ac2fe99401ed8a93cb0c2ad748a7a4194916",
      finalizedAt: "2027-02-28T00:10:00+05:00",
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
      // Rolling deadline: the vote stays open whenever the mock runs.
      votingEndsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      votesFor: null,
      votesAgainst: null,
      votesAbstain: null,
      result: null,
      completedAt: null,
      factorBps: null,
      explorerUrl: explorer(ACTION_PDA_2),
    },
    // Plan 15 D4 fixture: snapshot complete, payment + grace passed with the escrow short — declared in default.
    // Required = Σ net + tax = 500 000 tiyn, escrow holds 300 000 → shortfall 200 000 (2 000.00 KZT).
    {
      pda: ACTION_PDA_6,
      seriesMint: MINT_QPNB1,
      kind: "INTR",
      mandatory: "MAND",
      corpId: "QPNb1-INTR-0006",
      officialId: null,
      announcedAt: "2026-08-20T10:00:00+05:00",
      recordAt: "2026-09-05T00:00:00+05:00",
      paymentAt: "2026-09-15T00:00:00+05:00",
      periodStart: "2026-03-01",
      periodEnd: "2026-09-01",
      accrualDays: 180,
      rateBps: 1000,
      perUnitGross: kzt("5000", "50.00 KZT"),
      perUnitPrincipal: kzt("0", "0.00 KZT"),
      cashMint: MINT_TKZT,
      escrowBalance: kzt("300000", "3,000.00 KZT"),
      status: "Defaulted",
      snapshotSlot: 2244,
      snapshotHash: "C7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
      unitsSnapshotted: "100",
      holdersSnapshotted: 3,
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
      defaultedAt: "2026-09-16T00:05:00+05:00",
      curedAt: null,
      finalizedAt: "2026-09-05T00:12:00+05:00",
      explorerUrl: explorer(ACTION_PDA_6),
    },
    // Plan 15 D6 fixture: redemption paying out, one holder paid, two routed to the paying agent (PaidToAgent).
    {
      pda: ACTION_PDA_7,
      seriesMint: MINT_QPNB1,
      kind: "REDM",
      mandatory: "MAND",
      corpId: "QPNb1-REDM-0005",
      officialId: null,
      announcedAt: "2026-09-01T10:00:00+05:00",
      recordAt: "2026-09-10T00:00:00+05:00",
      paymentAt: "2026-09-20T00:00:00+05:00",
      periodStart: null,
      periodEnd: null,
      accrualDays: null,
      rateBps: 1000,
      perUnitGross: kzt("5000", "50.00 KZT"),
      perUnitPrincipal: kzt("100000", "1,000.00 KZT"),
      cashMint: MINT_TKZT,
      // coupon Σ 5,000.00 + principal Σ 100,000.00 = 105,000.00 KZT (10/25/65 units of 1,000 face at 10%)
      escrowBalance: kzt("10500000", "105,000.00 KZT"),
      status: "Settling",
      snapshotSlot: 2345,
      snapshotHash: "C7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
      unitsSnapshotted: "100",
      holdersSnapshotted: 3,
      // all three holders are out of the escrow (one to a wallet, two with the agent): complete waits on the agent
      holdersPaid: 3,
      bankPending: 2,
      totalGross: kzt("500000", "5,000.00 KZT"),
      totalTax: kzt("0", "0.00 KZT"),
      totalNet: kzt("500000", "5,000.00 KZT"),
      totalPaid: kzt("1050000", "10,500.00 KZT"),
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
      finalizedAt: "2026-09-10T00:15:00+05:00",
      explorerUrl: explorer(ACTION_PDA_7),
    },
  ],
  // Announced with the record date already past: drives the registrar dashboard's
  // "Announced" pipeline column and the record-date alert in mock mode.
  [MINT_BTRK]: [
    {
      pda: ACTION_PDA_3,
      seriesMint: MINT_BTRK,
      kind: "INTR",
      mandatory: "MAND",
      corpId: "BTRKdemo-INTR-0001",
      officialId: null,
      announcedAt: "2026-09-25T10:00:00+05:00",
      recordAt: "2026-09-28T00:00:00+05:00",
      paymentAt: "2026-10-28T00:00:00+05:00",
      periodStart: "2026-03-15",
      periodEnd: "2026-09-15",
      accrualDays: 180,
      rateBps: 1595,
      perUnitGross: usdc("79800000", "79.80 USDC"),
      perUnitPrincipal: usdc("0", "0.00 USDC"),
      cashMint: MINT_USDC,
      status: "Announced",
      snapshotSlot: null,
      snapshotHash: null,
      unitsSnapshotted: null,
      holdersSnapshotted: null,
      holdersPaid: null,
      totalGross: usdc("7980000000", "7,980.00 USDC"),
      totalTax: usdc("0", "0.00 USDC"),
      totalNet: usdc("7980000000", "7,980.00 USDC"),
      totalPaid: usdc("0", "0.00 USDC"),
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
      explorerUrl: explorer(ACTION_PDA_3),
    },
    {
      // Funded and unpaid (plan 15 task 1533): Claim buttons, "Claimable now", gross/tax/net rows in mock mode.
      pda: ACTION_PDA_4,
      seriesMint: MINT_BTRK,
      kind: "INTR",
      mandatory: "MAND",
      corpId: "BTRKdemo-INTR-0002",
      officialId: null,
      announcedAt: "2026-09-25T10:00:00+05:00",
      recordAt: "2026-09-28T00:00:00+05:00",
      paymentAt: "2026-10-28T00:00:00+05:00",
      periodStart: "2026-09-15",
      periodEnd: "2027-03-15",
      accrualDays: 180,
      rateBps: 1595,
      perUnitGross: usdc("79800000", "79.80 USDC"),
      perUnitPrincipal: usdc("0", "0.00 USDC"),
      cashMint: MINT_USDC,
      escrow: ESCROW_PDA_2,
      escrowBalance: usdc("7980000000", "7,980.00 USDC"),
      status: "Funded",
      snapshotSlot: 1235,
      snapshotHash: "D7oUNmockHASHqPQf2XN7pXhXpzKdQmYtWJChMAvery9",
      unitsSnapshotted: "100",
      holdersSnapshotted: 3,
      holdersPaid: 0,
      totalGross: usdc("7980000000", "7,980.00 USDC"),
      totalTax: usdc("359100000", "3,591.00 USDC"),
      totalNet: usdc("7620900000", "7,620.90 USDC"),
      totalPaid: usdc("0", "0.00 USDC"),
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
      explorerUrl: explorer(ACTION_PDA_4),
    },
  ],
  // One live showcase action per scenario (task 1535): each drives its series' life-stage chip.
  ...Object.fromEntries(
    SHOWCASE_SERIES.map((s, i) => {
      const [pda, kind, status, record, pay] = (
        [
          [
            "ActnPWR0001Dem0PDA111111111111111111111111111",
            "INTR",
            "Announced",
            "2027-04-08T00:00:00+05:00",
            "2027-04-09T00:00:00+05:00",
          ],
          [
            "ActnMTR0002Dem0PDA111111111111111111111111111",
            "REDM",
            "Funded",
            "2026-10-12T00:00:00+05:00",
            "2026-10-18T00:00:00+05:00",
          ],
          [
            "ActnMNG0003Dem0PDA111111111111111111111111111",
            "BMET",
            "VotingOpen",
            "2026-10-11T00:00:00+05:00",
            "2026-10-11T00:00:00+05:00",
          ],
          [
            "ActnOIL0004Dem0PDA111111111111111111111111111",
            "MCAL",
            "RecordStruck",
            "2026-10-13T00:00:00+05:00",
            "2026-10-20T00:00:00+05:00",
          ],
        ] as const
      )[i]!;
      return [
        s.mint,
        [
          {
            pda,
            seriesMint: s.mint,
            kind,
            mandatory: kind === "BMET" ? "VOLU" : "MAND",
            corpId: `${s.ticker.replace(/ /g, "")}-${kind}-0001`,
            officialId: null,
            announcedAt: "2026-10-09T10:00:00+05:00",
            recordAt: record,
            paymentAt: pay,
            periodStart: "2026-10-09",
            periodEnd: kind === "INTR" ? "2027-04-09" : null,
            accrualDays: kind === "INTR" ? 180 : null,
            rateBps: kind === "INTR" ? 1000 : null,
            perUnitGross:
              kind === "INTR" || kind === "REDM" || kind === "MCAL"
                ? kzt(
                    kind === "INTR" ? "5000" : "100000",
                    kind === "INTR" ? "50.00 KZT" : "1,000.00 KZT",
                  )
                : kzt("0", "0.00 KZT"),
            perUnitPrincipal: kzt("0", "0.00 KZT"),
            cashMint: MINT_TKZT,
            status,
            snapshotSlot: null,
            snapshotHash: null,
            unitsSnapshotted: null,
            holdersSnapshotted: null,
            holdersPaid: null,
            totalGross: kzt("0", "0.00 KZT"),
            totalTax: kzt("0", "0.00 KZT"),
            totalNet: kzt("0", "0.00 KZT"),
            totalPaid: kzt("0", "0.00 KZT"),
            totalRetired: null,
            holdersRetired: null,
            proposalNewRateBps: kind === "BMET" ? 1200 : null,
            proposalNewMaturity: null,
            votingEndsAt: kind === "BMET" ? "2026-10-16T18:00:00+05:00" : null,
            votesFor: null,
            votesAgainst: null,
            votesAbstain: null,
            result: null,
            completedAt: null,
            factorBps: null,
            explorerUrl: explorer(pda),
          },
        ] as ActionDTO[],
      ];
    }),
  ),
};

/** Entitlements of an action: the brief's numbers (10/25/65 units → 500/1,250/3,250 KZT). */
const entitlements: Record<string, EntitlementDTO[]> = {
  [ACTION_PDA_1]: INVESTOR_OWNERS.map((owner, i) => {
    const gross = ["50000", "125000", "325000"][i] ?? "0";
    return {
      pda: `EnTlDem0Pda${i}For${ACTION_PDA_1.slice(4, 12)}11111111111111111111111`,
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
    pda: `EnTlDem0Pda${i}For${ACTION_PDA_2.slice(4, 12)}11111111111111111111111`,
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
  // The funded BTRK coupon: unpaid Snapshotted entitlements — owner 2 is the nonresident with 15% withholding.
  // BTRK units 40/30/30 × 79.80 = 3,192.00 / 2,394.00 / 2,394.00 USDC (6-decimal USDC minors); tax 359.10 for owner 2.
  [ACTION_PDA_4]: INVESTOR_OWNERS.map((owner, i) => {
    const gross = ["3192000000", "2394000000", "2394000000"][i] ?? "0";
    const tax = i === 2 ? "359100000" : "0";
    const net = String(BigInt(gross) - BigInt(tax));
    const usd = (minor: string) =>
      usdc(minor, `${(Number(minor) / 1_000_000).toFixed(2)} USDC`);
    return {
      pda: `EnTlDem0Pda${i}For${ACTION_PDA_4.slice(4, 12)}11111111111111111111111`,
      actionPda: ACTION_PDA_4,
      owner,
      units: ["40", "30", "30"][i] ?? "0",
      gross: usd(gross),
      tax: usd(tax),
      net: usd(net),
      principal: usd("0"),
      status: "Snapshotted",
      paidAt: null,
      vote: "None",
      votedAt: null,
      explorerUrl: explorer(owner),
    };
  }),
  // D4 fixture: record-date claims stay open while the coupon is in default
  [ACTION_PDA_6]: INVESTOR_OWNERS.map((owner, i) => {
    const gross = ["50000", "125000", "325000"][i] ?? "0";
    return {
      pda: `EnTlDem0Pda${i}For${ACTION_PDA_6.slice(4, 12)}1111111111111111111111111`,
      actionPda: ACTION_PDA_6,
      owner,
      units: ["10", "25", "65"][i] ?? "0",
      gross: kzt(gross, `${(Number(gross) / 100).toFixed(2)} KZT`),
      tax: kzt("0", "0.00 KZT"),
      net: kzt(gross, `${(Number(gross) / 100).toFixed(2)} KZT`),
      principal: kzt("0", "0.00 KZT"),
      status: "Snapshotted",
      paidAt: null,
      vote: "None",
      votedAt: null,
      explorerUrl: explorer(owner),
    };
  }),
  // D6 fixture: one holder paid to the wallet, two routed to the paying agent.
  // Coupon 500/1,250/3,250 (the brief's 10/25/65 units) plus principal 10,000/25,000/65,000 KZT each.
  [ACTION_PDA_7]: INVESTOR_OWNERS.map((owner, i) => {
    const coupon = ["50000", "125000", "325000"][i] ?? "0";
    const principal = ["1000000", "2500000", "6500000"][i] ?? "0";
    const kztFmt = (minor: string) =>
      kzt(minor, `${(Number(minor) / 100).toFixed(2)} KZT`);
    const toAgent = i > 0;
    return {
      pda: `EnTlDem0Pda${i}For${ACTION_PDA_7.slice(4, 12)}1111111111111111111111111`,
      actionPda: ACTION_PDA_7,
      owner,
      units: ["10", "25", "65"][i] ?? "0",
      gross: kztFmt(coupon),
      tax: kzt("0", "0.00 KZT"),
      net: kztFmt(coupon),
      principal: kztFmt(principal),
      status: toAgent ? "PaidToAgent" : "Paid",
      paidAt: toAgent ? null : "2026-09-20T12:00:00+05:00",
      vote: "None",
      votedAt: null,
      explorerUrl: explorer(owner),
    };
  }),
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
  // QPNb1's coupon 1 mirrors its action: record 2027-02-28, payment 2027-03-01 (completedAt/finalizedAt below).
  ev(1, 1803099600, "ActionAnnounced", ACTION_PDA_1, SIGS[0]!),
  { ...ev(2, 1803755100, "RecordStruck", ACTION_PDA_1, SIGS[1]!) },
  ev(3, 1803755160, "HolderSnapshotted", ACTION_PDA_1, SIGS[2]!, {
    owner: INVESTOR_OWNERS[0],
    units: "10",
  }),
  ev(4, 1803755220, "HolderSnapshotted", ACTION_PDA_1, SIGS[0]!, {
    owner: INVESTOR_OWNERS[1],
    units: "25",
  }),
  ev(5, 1803755280, "HolderSnapshotted", ACTION_PDA_1, SIGS[1]!, {
    owner: INVESTOR_OWNERS[2],
    units: "65",
  }),
  ev(6, 1803755400, "SnapshotFinalized", ACTION_PDA_1, SIGS[2]!),
  ev(7, 1803798000, "ActionFunded", ACTION_PDA_1, SIGS[0]!, {
    amount: "500000",
    escrow_balance: "500000",
    required: "500000",
    fully_funded: true,
  }),
  ev(8, 1803884400, "EntitlementPaid", ACTION_PDA_1, SIGS[1]!, {
    owner: INVESTOR_OWNERS[0],
    net: "50000",
  }),
  ev(9, 1803884460, "EntitlementPaid", ACTION_PDA_1, SIGS[2]!, {
    owner: INVESTOR_OWNERS[1],
    net: "125000",
  }),
  ev(10, 1803884520, "EntitlementPaid", ACTION_PDA_1, SIGS[0]!, {
    owner: INVESTOR_OWNERS[2],
    net: "325000",
  }),
  ev(11, 1803885600, "ActionCompleted", ACTION_PDA_1, SIGS[1]!, {
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
  // D4 fixture (plan 15): the default declaration is a real timeline step with its own tx
  ev(16, 1789499100, "ActionDefaulted", ACTION_PDA_6, SIGS[0]!, {
    required: "500000",
    escrow_balance: "300000",
    shortfall: "200000",
  }),
  // D6 fixture (plan 15): bank-routed payouts land with the paying agent
  ev(17, 1789930800, "EntitlementPaid", ACTION_PDA_7, SIGS[1]!, {
    owner: INVESTOR_OWNERS[0],
    net: "1050000",
  }),
  ev(18, 1789930801, "PaidToAgent", ACTION_PDA_7, SIGS[2]!, {
    owner: INVESTOR_OWNERS[1],
    net: "2625000",
  }),
  ev(19, 1789930802, "PaidToAgent", ACTION_PDA_7, SIGS[0]!, {
    owner: INVESTOR_OWNERS[2],
    net: "6825000",
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
    // plan 15 D3: the plan-15-era fixtures snapshot with the order-independent set hash
    hashScheme: pda === ACTION_PDA_6 || pda === ACTION_PDA_7 ? 1 : 0,
    supply: 100,
    unitsSnapshotted: 100,
    totalsMatch: ok,
    checkedAt: Math.floor(Date.now() / 1000),
  };
}

const delay = <T>(body: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(body), 30));

/**
 * Public holder lookup fixture (plan 15 task 1533, mirrors Go /holders/{owner} from task 1525): positions across
 * both mock series with the payout route (owner 0 chose the bank route), entitlements with kind and paying tx, and
 * the next payout per series (the open action, else the projected next coupon through the schedule).
 */
function holderLookup(owner: string) {
  const i = INVESTOR_OWNERS.indexOf(owner);
  const known = i !== -1;
  const unitsByMint = known
    ? [
        { s: series[0]!, units: ["10", "25", "65"][i]! },
        { s: series[1]!, units: ["40", "30", "30"][i]! },
      ]
    : [];
  const txUrl = (sig: string) =>
    `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
  const positions = unitsByMint.map(({ s, units }, k) => ({
    series: `SeRiesDem0Pda${k}1111111111111111111111111111111111`,
    mint: s.mint,
    ticker: s.ticker,
    isin: s.isin,
    bondAta: `BoNdAtaDem0${s.mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    cashAta: `CaShAtaDem0${s.mint.slice(4, 8)}Pda${i}111111111111111111111111111`,
    units,
    status: "Active",
    kyc: {
      attested: true,
      ref: `KycAttestPda${i}111111111111111111111111111111`,
    },
    // Owner 0 chose the bank route on the BTRK position: the card shows the stored hash (never the reference).
    payoutRoute:
      i === 0 && s.mint === MINT_BTRK
        ? {
            route: "bank",
            bankRefHash: "a1b2c3d4e5".padEnd(64, "0"),
            updatedAt: "2026-09-20T10:00:00+05:00",
          }
        : undefined,
    explorerUrl: explorer(owner),
  }));
  const ents = known
    ? Object.values(entitlements)
        .flat()
        .filter((e) => e.owner === owner)
        .map((e) => {
          const action = Object.values(actions)
            .flat()
            .find((a) => a.pda === e.actionPda);
          const paidTx = e.status === "Paid" ? SIGS[0] : undefined;
          return {
            ...e,
            kind: action?.kind ?? "INTR",
            paidTx,
            paidTxUrl: paidTx ? txUrl(paidTx) : undefined,
          };
        })
    : [];
  // One upcoming payout per series: BTRK's open action, QPNb1's projected next coupon.
  const upcoming = known
    ? [
        {
          mint: MINT_BTRK,
          ticker: "BTRKdemo",
          kind: "INTR",
          actionPda: ACTION_PDA_3,
          recordAt: "2026-09-28T00:00:00+05:00",
          paymentAt: "2026-10-28T00:00:00+05:00",
        },
        {
          mint: MINT_QPNB1,
          ticker: "QPNb1",
          kind: "INTR (projected)",
          actionPda: null,
          recordAt: "2027-03-01T00:00:00+05:00",
          paymentAt: "2027-03-01T00:00:00+05:00",
        },
      ]
    : [];
  return { owner, positions, entitlements: ents, upcomingPayouts: upcoming };
}
/** Serve one registrar API path from the feature mocks (platform v2) or the fixtures above. */
export function mockGet(path: string): Promise<unknown> {
  const feature = featureMock("GET", path);
  if (feature) return delay(feature.value);
  const notFound = () => {
    throw new Api404(`series ${path} not found`);
  };

  // openTrades (plan 13) follows the mutable trades mock
  const withTrades = (s: SeriesDTO): SeriesDTO => ({
    ...s,
    openTrades: openTradesOf(s.mint),
  });
  // Showcase demo clock: pin the bond date per request (always day 10 of period 1) so the
  // accelerated clock never drifts past maturity between mock sessions.
  const withLiveClock = (s: SeriesDTO): SeriesDTO =>
    s.demoClock
      ? {
          ...s,
          demoClock: {
            ...s.demoClock,
            issueTs: Math.floor(Date.now() / 1000) - 10 * s.demoClock.daySecs,
          },
        }
      : s;
  // Featured first, mirroring the registrar's /series ordering (rest.go: ISIN asc within featured).
  if (path === "/series")
    return delay(
      series
        .map(withTrades)
        .map(withLiveClock)
        .toSorted(
          (a, b) => Number(b.featured ?? false) - Number(a.featured ?? false),
        ),
    );
  if (path.startsWith("/activity")) {
    // ?mint=<bond mint> narrows the feed server-side (mirrors the registrar, task 91550)
    const mint = decodeURIComponent(/[?&]mint=([^&]+)/.exec(path)?.[1] ?? "");
    return delay(
      mint ? activity.filter((e) => e.seriesMint === mint) : activity,
    );
  }
  if (path.startsWith("/registrar/audit")) return delay({ items: auditTrail });
  if (path.startsWith("/approvals")) {
    const want = path.includes("executed") ? "executed" : "pending";
    return delay({ approvals: approvals.filter((a) => a.status === want) });
  }
  const reconcileMatch = /^\/actions\/([^/]+)\/reconcile$/.exec(path);
  if (reconcileMatch) {
    return delay(mockReconcile(reconcileMatch[1]!));
  }
  const holderMatch = /^\/holders\/([^/]+)$/.exec(path);
  if (holderMatch) {
    return delay(holderLookup(holderMatch[1]!));
  }
  // plan 15 D6: the console's bank confirmations panel
  const bankMatch = /^\/actions\/([^/]+)\/bank-pending$/.exec(path);
  if (bankMatch) {
    const pda = bankMatch[1]!;
    const found = Object.values(actions)
      .flat()
      .find((a) => a.pda === pda);
    const items =
      pda === ACTION_PDA_7
        ? [1, 2].map((i) => ({
            owner: INVESTOR_OWNERS[i]!,
            entitlementPda: `EnTlDem0Pda${i}For${ACTION_PDA_7.slice(4, 12)}1111111111111111111111111`,
            amount: (() => {
              const minor = ["2625000", "6825000"][i - 1]!;
              return kzt(minor, `${(Number(minor) / 100).toFixed(2)} KZT`);
            })(),
            routeBankRefHash: `a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b${i}`,
          }))
        : [];
    return delay({ bankPending: found?.bankPending ?? 0, items });
  }
  // plan 15 D9: server-side comparison of the served seev.031 vs the anchored hash
  const dhMatch = /^\/actions\/([^/]+)\/disclosure-hash$/.exec(path);
  if (dhMatch) {
    const found = Object.values(actions)
      .flat()
      .find((a) => a.pda === dhMatch[1]);
    const hash =
      "e69e6726894709998fb8a9c481c0ac2fe99401ed8a93cb0c2ad748a7a4194916";
    const onchain = found?.disclosureHash ?? "";
    return delay({
      hash,
      onchain,
      match: Boolean(onchain) && onchain === hash,
    });
  }
  const seriesMatch = /^\/series\/([^/]+)$/.exec(path);
  if (seriesMatch) {
    // Magic mint for e2e: a registrar 500 so the (public) error boundary renders.
    if (seriesMatch[1] === "boom")
      return Promise.reject(new Mock500("mock registrar exploded (e2e)"));
    const found = series.find((s) => s.mint === seriesMatch[1]);
    return found
      ? delay(withLiveClock(withTrades(found)))
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
      const showcase = SHOWCASE_SERIES.find((s) => s.mint === mint);
      return delay(
        mint === MINT_QPNB1
          ? couponSchedule(
              [2026, 9, 1],
              4,
              kzt("5000", "50.00 KZT"),
              kzt("500000", "5,000.00 KZT"),
              true,
            )
          : showcase
            ? couponSchedule(
                [2026, 10, 9],
                showcase.coupons,
                kzt("5000", "50.00 KZT"),
                kzt("500000", "5,000.00 KZT"),
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
  // text downloads (ISO XML) served through the bo-get proxy: the browser-side disclosure hash check fetches
  // the seev.031 this way (mockGetText holds the fixtures)
  if (path.endsWith(".xml")) return mockGetText(path);
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

/** Mock-only HTTP 500 (mint "boom" in e2e) so the error boundary can be exercised without a real outage. */
class Mock500 extends Error {
  readonly code = "http_500";
  readonly status = 500;
}
