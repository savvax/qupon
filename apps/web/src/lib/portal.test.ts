import { describe, expect, it } from "vitest";
import { DayCount } from "@qupon/client/src/lib/daycount";
import {
  claimableEntitlements,
  estimateCoupon,
  openMeetings,
  sha256Bytes,
  sha256Hex,
  VOTE_CHOICES,
  type SeriesRow,
} from "./portal";
import { explainError, onchainErrorName } from "./walletSigner";
import type { ActionDTO, EntitlementDTO, SeriesDTO } from "./api";

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

describe("claimableEntitlements (Claim button, plan 15 D2)", () => {
  const funded = { pda: "A1", status: "Funded" } as ActionDTO;
  const settling = { pda: "A2", status: "Settling" } as ActionDTO;
  const done = { pda: "A3", status: "Completed" } as ActionDTO;
  const ent = (actionPda: string, status: string, pda: string) =>
    ({ actionPda, status, pda }) as EntitlementDTO;
  const rows = [
    {
      actions: [funded, settling, done],
      entitlements: [
        ent("A1", "Snapshotted", "e1"), // claimable: funded + unpaid
        ent("A1", "Paid", "e2"), // already paid
        ent("A2", "Snapshotted", "e3"), // claimable: paying continues while settling
        ent("A3", "Snapshotted", "e4"), // not funded yet
        ent("A9", "Snapshotted", "e5"), // action unknown to the row
      ],
    },
  ] as unknown as SeriesRow[];

  it("lists unpaid entitlements of Funded/Settling actions only", () => {
    expect(claimableEntitlements(rows).map((c) => c.entitlement.pda)).toEqual([
      "e1",
      "e3",
    ]);
  });

  it("carries the action each claim pays", () => {
    const out = claimableEntitlements(rows);
    expect(out[0]!.action.pda).toBe("A1");
    expect(out[1]!.action.pda).toBe("A2");
  });
});

describe("WebCrypto payout-route hashing (only the hash leaves the browser)", () => {
  it("sha256Hex matches the known vectors", async () => {
    // sha256("") and sha256("KZ00 1234 5678 9012")-style inputs — verified independently.
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("sha256Bytes yields the same 32 bytes the program stores", async () => {
    const bytes = await sha256Bytes("abc");
    expect(bytes).toHaveLength(32);
    expect(Buffer.from(bytes).toString("hex")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
