import { describe, expect, it } from "vitest";
import { DayCount } from "@qupon/client/src/lib/daycount";
import { estimateCoupon, openMeetings, VOTE_CHOICES } from "./portal";
import { explainError, onchainErrorName } from "./walletSigner";
import type { ActionDTO, SeriesDTO } from "./api";

const series = {
  faceValue: { minor: "100000", display: "1,000.00 KZT", currency: "tKZT" },
  couponRateBps: 1000,
  dayCount: "THIRTY_360",
} as Pick<SeriesDTO, "faceValue" | "couponRateBps" | "dayCount">;

describe("estimateCoupon (TS daycount lib)", () => {
  it("10 units × 1,000 KZT face × 10% × 180/360 = 500.00 KZT (brief vector)", () => {
    expect(
      estimateCoupon(series, "10", {
        periodStart: "2026-09-01",
        periodEnd: "2027-03-01",
      }),
    ).toBe(50_000n);
  });

  it("65 units → 3,250.00 KZT", () => {
    expect(
      estimateCoupon(series, "65", {
        periodStart: "2026-09-01",
        periodEnd: "2027-03-01",
      }),
    ).toBe(325_000n);
  });

  it("returns undefined for an unsupported day count", () => {
    expect(
      estimateCoupon({ ...series, dayCount: "ACT_ACT" }, "10", {
        periodStart: "2026-09-01",
        periodEnd: "2027-03-01",
      }),
    ).toBeUndefined();
  });
});

describe("openMeetings", () => {
  const action = {
    kind: "BMET",
    status: "VotingOpen",
    votingEndsAt: "2099-01-01T00:00:00+05:00",
  } as ActionDTO;

  it("lists BMET actions with voting open", () => {
    const rows = [
      { actions: [action] },
      { actions: [{ ...action, status: "Finalized" }] },
    ] as Parameters<typeof openMeetings>[0];
    expect(openMeetings(rows)).toHaveLength(1);
  });

  it("excludes meetings whose voting window has ended", () => {
    const rows = [
      { actions: [{ ...action, votingEndsAt: "2020-01-01T00:00:00+05:00" }] },
    ] as Parameters<typeof openMeetings>[0];
    expect(openMeetings(rows)).toHaveLength(0);
  });
});

describe("vote choices", () => {
  it("map to the on-chain VoteChoice codes", () => {
    expect(VOTE_CHOICES).toEqual({ For: 1, Against: 2, Abstain: 3 });
  });
});

describe("error name extraction", () => {
  it("pulls the Anchor error name out of simulation logs", () => {
    const e = new Error("failed to send transaction", {
      cause: {
        logs: [
          "AnchorError occurred. Error Code: AlreadyVoted. Error Number: 6002.",
        ],
      },
    });
    expect(onchainErrorName(e)).toBe("AlreadyVoted");
    expect(explainError(e)).toContain("AlreadyVoted");
    expect(explainError(e)).toContain("already voted");
  });

  it("falls back to the message for non-program errors", () => {
    expect(explainError(new Error("network down"))).toBe("network down");
  });
});

describe("DayCount sanity (shared lib import)", () => {
  it("30/360 accrual of a semi-annual period is 180", () => {
    expect(DayCount.Thirty360).toBe(0);
  });
});
