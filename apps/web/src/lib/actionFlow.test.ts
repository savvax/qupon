import { describe, expect, it } from "vitest";
import type { ActionDTO, ActivityLike } from "./api";
import {
  buildTimeline,
  findOnchainError,
  nextStep,
  paidTxByOwner,
  stepsForKind,
} from "./actionFlow";

const base: ActionDTO = {
  pda: "ActionPda1111111111111111111111111111111111111",
  seriesMint: "Mint111111111111111111111111111111111111111",
  kind: "INTR",
  mandatory: "MAND",
  corpId: "QPNb1-INTR-0001",
  recordAt: "2027-02-28T00:00:00+05:00",
  paymentAt: "2027-03-01T00:00:00+05:00",
  perUnitGross: { minor: "5000", display: "50.00 KZT", currency: "tKZT" },
  perUnitPrincipal: { minor: "0", display: "0.00 KZT", currency: "tKZT" },
  cashMint: "Cash111111111111111111111111111111111111111",
  escrow: "Escrow11111111111111111111111111111111111111",
  status: "Announced",
  explorerUrl: "https://explorer.solana.com/address/x?cluster=devnet",
};

const ev = (
  id: number,
  kind: string,
  sig: string,
  payload: Record<string, unknown> = {},
): ActivityLike => ({
  id,
  ts: 1772000000 + id,
  kind,
  sig,
  actionPda: base.pda,
  payload,
});

describe("stepsForKind", () => {
  it("gives INTR the coupon path and REDM retire+close", () => {
    expect(stepsForKind("INTR")).not.toContain("retire");
    expect(stepsForKind("REDM")).toEqual([
      "announce",
      "strike",
      "snapshot",
      "finalize",
      "fund",
      "pay",
      "complete",
      "retire",
      "close",
    ]);
    expect(stepsForKind("BMET")).toContain("apply");
  });
});

describe("nextStep (mirror of Go executor.NextStep)", () => {
  it("offers no strike while the series has open secondary trades", () => {
    const a = { ...base, status: "Announced" as const };
    expect(nextStep(a, Date.now(), 100n, 2)).toEqual({
      step: null,
      wait: "open secondary trades: settle or cancel them first (2)",
    });
    expect(nextStep(a, Date.now(), 100n, 0)).toMatchObject({ step: "strike" });
    // only the strike is gated: later steps run with the mint already paused
    expect(
      nextStep({ ...base, status: "RecordStruck" }, Date.now(), 100n, 2),
    ).toMatchObject({ step: "snapshot" });
  });
  it("walks the coupon lifecycle", () => {
    expect(nextStep({ ...base, status: "Announced" })).toMatchObject({
      step: "strike",
    });
    expect(nextStep({ ...base, status: "RecordStruck" })).toMatchObject({
      step: "snapshot",
    });
    // units == supply → finalize (executor.NextStep) — no holder list needed,
    // so listInvestors being down must not block the console
    expect(
      nextStep(
        { ...base, status: "RecordStruck", unitsSnapshotted: "100" },
        Date.now(),
        100n,
      ),
    ).toMatchObject({ step: "finalize" });
    expect(
      nextStep(
        { ...base, status: "RecordStruck", unitsSnapshotted: "99" },
        Date.now(),
        100n,
      ),
    ).toMatchObject({ step: "snapshot" });
    // supply 0 → nothing can be snapshotted: waiting, not another snapshot
    expect(
      nextStep({ ...base, status: "RecordStruck" }, Date.now(), 0n),
    ).toMatchObject({
      step: null,
      wait: "no bonds outstanding — nothing to snapshot",
    });
    expect(nextStep({ ...base, status: "SnapshotComplete" })).toMatchObject({
      step: "fund",
    });
    expect(nextStep({ ...base, status: "Funded" })).toMatchObject({
      step: "pay",
    });
    expect(
      nextStep({
        ...base,
        status: "Settling",
        holdersSnapshotted: 3,
        holdersPaid: 3,
      }),
    ).toMatchObject({ step: "complete" });
    expect(nextStep({ ...base, status: "Completed" }).step).toBeNull();
  });

  it("gates the meeting on the voting window", () => {
    const open = {
      ...base,
      kind: "BMET" as const,
      status: "VotingOpen" as const,
      votingEndsAt: new Date(Date.now() + 3600_000).toISOString(),
      unitsSnapshotted: "100",
      votesFor: "10",
      votesAgainst: "0",
      votesAbstain: "0",
    };
    expect(nextStep(open).step).toBeNull();
    expect(nextStep({ ...open, votesFor: "100" })).toMatchObject({
      step: "meet_finalize",
    });
    expect(
      nextStep({
        ...open,
        votingEndsAt: new Date(Date.now() - 1000).toISOString(),
      }),
    ).toMatchObject({
      step: "meet_finalize",
    });
    expect(
      nextStep({
        ...base,
        kind: "BMET",
        status: "Finalized",
        result: "Approved",
      }),
    ).toMatchObject({ step: "apply" });
    expect(
      nextStep({
        ...base,
        kind: "BMET",
        status: "Finalized",
        result: "Rejected",
      }).step,
    ).toBeNull();
  });
});

describe("buildTimeline", () => {
  it("marks announce done, strike current, links signatures from events", () => {
    const activity = [
      ev(1, "ActionAnnounced", "SigAnnounce1111111111111111111111111111111111"),
      ev(2, "RecordStruck", "SigStrike111111111111111111111111111111111111"),
    ];
    // announce+strike both happened but the DTO still says Announced →
    // event evidence wins for done-ness; first non-done step is current.
    const steps = buildTimeline(
      { ...base, status: "Announced" },
      activity,
      false,
    );
    expect(steps[0]).toMatchObject({
      state: "done",
      signature: "SigAnnounce1111111111111111111111111111111111",
    });
    expect(steps[1]).toMatchObject({
      state: "done",
      signature: "SigStrike111111111111111111111111111111111111",
    });
    expect(steps[2]).toMatchObject({ state: "current" });
    expect(steps.at(-1)).toMatchObject({ state: "pending" });
  });

  it("maps advance:* audit rows when ingest was off", () => {
    const steps = buildTimeline(
      { ...base, status: "SnapshotComplete" },
      [ev(1, "advance:strike_record", "advance-strike_record-1-1")],
      false,
    );
    expect(steps[1]?.state).toBe("done");
    expect(steps[1]?.signature).toBeUndefined(); // synthetic sig is not a tx
  });

  it("shows holder progress detail while paying", () => {
    const steps = buildTimeline(
      { ...base, status: "Settling", holdersSnapshotted: 3, holdersPaid: 1 },
      [],
      false,
    );
    expect(steps.find((s) => s.label === "Pay holders")).toMatchObject({
      state: "current",
      detail: { key: "paid", values: { done: 1, count: 3 } },
    });
  });
});

describe("findOnchainError", () => {
  it("extracts names from CLI stderr-ish text", () => {
    expect(findOnchainError("custom program error: 0x7d0 TooEarly")).toBe(
      "TooEarly",
    );
    expect(findOnchainError("failed: Underfunded: escrow short")).toBe(
      "Underfunded",
    );
    expect(findOnchainError("plain network hiccup")).toBeUndefined();
  });
});

describe("paidTxByOwner", () => {
  it("maps owners to their EntitlementPaid signature", () => {
    const owner = "Owner111111111111111111111111111111111111111";
    const activity = [
      ev(1, "EntitlementPaid", "SigPaid111111111111111111111111111111111111", {
        owner,
      }),
      ev(2, "EntitlementPaid", "SigOther11111111111111111111111111111111111", {
        owner,
        // different action
      }),
    ];
    activity[1]!.actionPda = "AnotherAction11111111111111111111111111111111";
    const map = paidTxByOwner(activity, base.pda);
    expect(map.get(owner)).toBe("SigPaid111111111111111111111111111111111111");
  });
});
