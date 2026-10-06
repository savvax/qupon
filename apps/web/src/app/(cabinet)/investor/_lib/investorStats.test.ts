import { describe, expect, it } from "vitest";
import type {
  ActionDTO,
  EntitlementDTO,
  InvestorDTO,
  ScheduleItem,
  SeriesDTO,
} from "@/lib/api";
import type { SeriesRow } from "@/lib/portal";
import { faceTotals, nextPayment, receivedToDate } from "./investorStats";

const kzt = (minor: string) => ({
  minor,
  display: `${minor} KZT`,
  currency: "tKZT",
});
const usdc = (minor: string) => ({
  minor,
  display: `${minor} USDC`,
  currency: "USDC",
});

function series(over: Partial<SeriesDTO> = {}): SeriesDTO {
  return {
    mint: "QpNb1Dem0BondMint1111111111111111111111111111",
    cashMint: "BYPKzbKvf1up8iJSjx21gS87YwzLKH7gdq5uLJUHZia4",
    isin: "KZ2C0QUPON01",
    ticker: "QPNb1",
    faceValue: kzt("100000"),
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
    explorerUrl: "https://explorer.solana.com",
    ...over,
  };
}

function investor(units: string): InvestorDTO {
  return {
    owner: "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
    bondAta: "BoNdAtaDem0Pda111111111111111111111111111111",
    cashAta: "CaShAtaDem0Pda111111111111111111111111111111",
    units,
    status: "Active",
    explorerUrl: "https://explorer.solana.com",
  };
}

function coupon(
  n: number,
  paymentDate: string,
  status: ScheduleItem["status"] = "Projected",
): ScheduleItem {
  return {
    couponNumber: n,
    periodStart: "2026-09-01",
    periodEnd: "2027-03-01",
    recordDate: "2027-02-28T00:00:00+05:00",
    paymentDate,
    amountPerUnit: kzt("5000"),
    totalAmount: kzt("500000"),
    actionPda: null,
    status,
  };
}

function paid(net: string): EntitlementDTO {
  return {
    pda: `EnTl${net}`,
    actionPda: "ActnINTR0001Dem0PDA111111111111111111111111111",
    owner: "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
    units: "65",
    gross: kzt(net),
    tax: kzt("0"),
    net: kzt(net),
    principal: kzt("0"),
    status: "Paid",
    paidAt: "2027-03-01T12:00:00+05:00",
    vote: "None",
    votedAt: null,
    explorerUrl: "https://explorer.solana.com",
  };
}

function snapshotted(): EntitlementDTO {
  return {
    ...paid("325000"),
    status: "Snapshotted",
    paidAt: null,
    pda: "EnTlSnap",
  };
}

const actions: ActionDTO[] = [
  {
    pda: "ActnINTR0001Dem0PDA111111111111111111111111111",
    seriesMint: "QpNb1Dem0BondMint1111111111111111111111111111",
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
    perUnitGross: kzt("5000"),
    perUnitPrincipal: kzt("0"),
    cashMint: "BYPKzbKvf1up8iJSjx21gS87YwzLKH7gdq5uLJUHZia4",
    escrow: "EscrowDem0PDA11111111111111111111111111111111",
    escrowBalance: kzt("500000"),
    status: "Completed",
    snapshotSlot: 1234,
    snapshotHash: null,
    unitsSnapshotted: "100",
    holdersSnapshotted: 3,
    holdersPaid: 3,
    totalGross: kzt("500000"),
    totalTax: kzt("0"),
    totalNet: kzt("500000"),
    totalPaid: kzt("500000"),
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
    explorerUrl: "https://explorer.solana.com",
  },
];

describe("investorStats", () => {
  const row = (over: Partial<SeriesRow>): SeriesRow => ({
    series: series(),
    schedule: [coupon(1, "2027-03-01T00:00:00+05:00")],
    actions,
    entitlements: [],
    ...over,
  });

  it("face totals: units × face per currency across series", () => {
    const rows = [
      row({ me: investor("65") }),
      row({
        series: series({ ticker: "BTRK", faceValue: usdc("1000000") }),
        me: investor("30"),
      }),
      row({ me: undefined }), // not registered → ignored
    ];
    expect(faceTotals(rows)).toEqual([
      { currency: "tKZT", minor: 6_500_000n },
      { currency: "USDC", minor: 30_000_000n },
    ]);
  });

  it("received to date sums Paid entitlements only (net + principal)", () => {
    const rows = [
      row({
        me: investor("65"),
        entitlements: [paid("325000"), snapshotted()],
      }),
      row({
        series: series({ ticker: "BTRK", faceValue: usdc("1000000") }),
        me: investor("30"),
        entitlements: [
          {
            ...paid("2340000"),
            net: usdc("2340000"),
            principal: usdc("1000000"),
            gross: usdc("2340000"),
          },
        ],
      }),
    ];
    expect(receivedToDate(rows)).toEqual([
      { currency: "tKZT", minor: 325_000n },
      { currency: "USDC", minor: 2_340_000n + 1_000_000n },
    ]);
  });

  it("next payment: earliest upcoming coupon with the held-units estimate", () => {
    const rows = [
      row({
        me: investor("65"),
        schedule: [
          coupon(1, "2030-01-01T00:00:00+05:00"),
          coupon(2, "2027-03-01T00:00:00+05:00", "Completed"),
        ],
      }),
    ];
    expect(nextPayment(rows)).toEqual({
      date: "2030-01-01T00:00:00+05:00",
      est: { currency: "tKZT", minor: 325_000n },
    });
  });

  it("next payment: none when every coupon is completed or nothing held", () => {
    expect(
      nextPayment([
        row({
          me: investor("65"),
          schedule: [coupon(1, "2027-03-01T00:00:00+05:00", "Completed")],
        }),
      ]),
    ).toBeUndefined();
    expect(nextPayment([row({ me: undefined })])).toBeUndefined();
  });
});
