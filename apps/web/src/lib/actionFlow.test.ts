import { describe, expect, it } from "vitest";
import type { ActionDTO, ActivityLike } from "./api";
import {
  buildTimeline,
  defaultDue,
  findOnchainError,
  fundingShortfall,
  nextStep,
  paidTxByOwner,
  STEP_ACTOR,
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

  it("carries the time gate the NowBar counts down to", () => {
    const now = Date.parse("2027-02-27T00:00:00+05:00");
    // before the record date the strike is next but TooEarly: count to the record date
    expect(nextStep(base, now)).toMatchObject({
      step: "strike",
      gate: { kind: "record", at: Date.parse(base.recordAt) },
    });
    expect(
      nextStep(base, Date.parse("2027-02-28T00:00:01+05:00")).gate,
    ).toBeUndefined();
    // funding races the payment date (shown before and after it)
    expect(
      nextStep({ ...base, status: "SnapshotComplete" }, now),
    ).toMatchObject({
      step: "fund",
      gate: { kind: "payment", at: Date.parse(base.paymentAt) },
    });
    // an open vote counts to the end of the voting window
    const votingEndsAt = "2027-02-27T12:00:00+05:00";
    expect(
      nextStep(
        {
          ...base,
          kind: "BMET",
          status: "VotingOpen",
          unitsSnapshotted: "100",
          votingEndsAt,
        },
        now,
      ),
    ).toMatchObject({
      step: null,
      gate: { kind: "vote", at: Date.parse(votingEndsAt) },
    });
  });

  it("plan 15 fixture states: a default is cured by funding; bank payouts wait on the paying agent", () => {
    expect(nextStep({ ...base, status: "Defaulted" })).toMatchObject({
      step: "fund",
    });
    expect(STEP_ACTOR.fund).toBe("issuer");
    const settled = {
      ...base,
      status: "Settling" as const,
      holdersSnapshotted: 3,
      holdersPaid: 3,
    };
    expect(nextStep({ ...settled, bankPending: 1 })).toMatchObject({
      step: "confirm_bank",
    });
    expect(STEP_ACTOR.confirm_bank).toBe("payingAgent");
    expect(nextStep({ ...settled, bankPending: 0 })).toMatchObject({
      step: "complete",
    });
    // the crank steps are permissionless
    for (const s of [
      "strike",
      "snapshot",
      "finalize",
      "pay",
      "complete",
      "retire",
    ] as const)
      expect(STEP_ACTOR[s]).toBe("anyone");
  });

  it("plan 15 D4: declare_default is offered to anyone once funding is overdue; funding cures", () => {
    // snapshot done, payment 2027-03-01, required 500 000 tiyn, escrow holds 300 000
    const unfunded = {
      ...base,
      status: "SnapshotComplete" as const,
      finalizedAt: "2027-02-28T00:10:00+05:00",
      unitsSnapshotted: "100",
      totalNet: { minor: "500000", display: "5,000.00 KZT", currency: "tKZT" },
      totalTax: { minor: "0", display: "0.00 KZT", currency: "tKZT" },
      escrowBalance: {
        minor: "300000",
        display: "3,000.00 KZT",
        currency: "tKZT",
      },
    };
    expect(fundingShortfall(unfunded)).toBe(200000n);
    // before payment + one day: the issuer funds (gate = payment date)
    expect(
      nextStep(unfunded, Date.parse("2027-03-01T12:00:00+05:00")),
    ).toMatchObject({ step: "fund" });
    // at payment + one day, still short: any wallet may record the default
    const due = defaultDue(unfunded);
    expect(due).toBe(Date.parse("2027-03-02T00:00:00+05:00"));
    expect(nextStep(unfunded, due)).toMatchObject({
      step: "declare_default",
      gate: { kind: "default", at: due },
    });
    expect(STEP_ACTOR.declare_default).toBe("anyone");
    // the demo clock's grace is one series day (120 s here), not 86 400 s
    const dueFast = defaultDue(unfunded, 120);
    expect(dueFast).toBe(Date.parse("2027-03-01T00:02:00+05:00"));
    expect(nextStep(unfunded, dueFast - 1000, undefined, 0, 120)).toMatchObject(
      {
        step: "fund",
      },
    );
    expect(nextStep(unfunded, dueFast, undefined, 0, 120)).toMatchObject({
      step: "declare_default",
    });
    // fully funded past the deadline: nothing to declare
    const funded = {
      ...unfunded,
      escrowBalance: {
        minor: "500000",
        display: "5,000.00 KZT",
        currency: "tKZT",
      },
    };
    expect(fundingShortfall(funded)).toBe(0n);
    expect(nextStep(funded, due)).toMatchObject({ step: "fund" });
  });

  it("a defaulted action shows the fund step red and the declaration in the timeline", () => {
    const a = {
      ...base,
      status: "Defaulted" as const,
      defaultedAt: "2027-03-02T00:05:00+05:00",
    };
    const steps = buildTimeline(
      a,
      [
        ev(
          9,
          "ActionDefaulted",
          "SigDefault1111111111111111111111111111111111",
        ),
      ],
      false,
    );
    expect(steps.find((s) => s.id === "fund")).toMatchObject({
      state: "defaulted",
    });
    // the declaration branches off the funding step — right after it, not after completion (preflight #8)
    const declared = steps.findIndex((s) => s.id === "declare_default");
    expect(declared).toBe(steps.findIndex((s) => s.id === "fund") + 1);
    expect(steps[declared]).toMatchObject({
      state: "done",
      signature: "SigDefault1111111111111111111111111111111111",
    });
    // no event indexed yet: the Defaulted status alone proves the step ran
    const noEvent = buildTimeline(a, [], false);
    const declared0 = noEvent.findIndex((s) => s.id === "declare_default");
    expect(declared0).toBe(noEvent.findIndex((s) => s.id === "fund") + 1);
    expect(noEvent[declared0]).toMatchObject({
      state: "done",
    });
    expect(noEvent.find((s) => s.id === "fund")?.state).toBe("defaulted");
    // every step the action passed before it stalled is done — none may pose as "current"
    // (indexer lag: a Defaulted action with no events yet must not render Announced as next)
    for (const id of ["announce", "strike", "snapshot", "finalize"])
      expect(noEvent.find((s) => s.id === id)?.state, id).toBe("done");
    expect(noEvent.some((s) => s.state === "current")).toBe(false);
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
  it("an announced action shows announce done and the record date next, even before any event", () => {
    const steps = buildTimeline({ ...base, status: "Announced" }, [], false);
    expect(steps[0]).toMatchObject({ id: "announce", state: "done" });
    expect(steps[1]).toMatchObject({ id: "strike", state: "current" });
  });
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

  it("keeps the pay step current until every holder is out (preflight #4)", () => {
    // partial pay: the first EntitlementPaid event must not mark "Paid ✓ 2 of 3" done
    const partial = buildTimeline(
      { ...base, status: "Settling", holdersSnapshotted: 3, holdersPaid: 2 },
      [ev(5, "EntitlementPaid", "SigPaid111111111111111111111111111111111111")],
      false,
    );
    expect(partial.find((s) => s.id === "pay")).toMatchObject({
      state: "current",
      detail: { key: "paid", values: { done: 2, count: 3 } },
    });
    expect(partial.find((s) => s.id === "complete")?.state).toBe("pending");
    // bank pending: every holder left the escrow, two sit with the paying agent — still not done
    const bank = buildTimeline(
      {
        ...base,
        status: "Settling",
        holdersSnapshotted: 3,
        holdersPaid: 3,
        bankPending: 2,
      },
      [ev(6, "PaidToAgent", "SigAgent11111111111111111111111111111111111")],
      false,
    );
    expect(bank.find((s) => s.id === "pay")?.state).toBe("current");
    expect(bank.find((s) => s.id === "complete")?.state).toBe("pending");
    // completed: pay stays done and the events keep their signature
    const done = buildTimeline(
      { ...base, status: "Completed", holdersSnapshotted: 3, holdersPaid: 3 },
      [ev(7, "EntitlementPaid", "SigPaid111111111111111111111111111111111111")],
      false,
    );
    expect(done.find((s) => s.id === "pay")).toMatchObject({
      state: "done",
      signature: "SigPaid111111111111111111111111111111111111",
    });
  });

  it("appends the sweep step only when a sweep activity row exists (task 1414)", () => {
    const done = { ...base, status: "Completed" as const };
    // no row yet: the coupon path ends at complete
    expect(buildTimeline(done, [], false).map((s) => s.id)).not.toContain(
      "sweep",
    );
    // the on-chain event row (ingest) and the Go audit rows all mark it swept
    for (const kind of [
      "EscrowSwept",
      "advance:sweep_escrow",
      "scheduler:sweep_escrow",
    ]) {
      const steps = buildTimeline(done, [ev(9, kind, "sig-sweep")], false);
      expect(steps.at(-1)).toMatchObject({
        id: "sweep",
        state: "done",
        signature: "sig-sweep",
      });
    }
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
