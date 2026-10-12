import { describe, expect, it } from "vitest";
import type { ActivityLike } from "./api";
import {
  bondDate,
  dedupeFeedActivity,
  isSchedulerStep,
  schedulerStep,
} from "./sandbox";
import { sandboxFailureKind } from "./sandbox";

// The dossier's "as of" date for a demo-clock series (task 1535 review): the yield block must
// use the bond's own calendar, not the real one — a showcase bond (daySecs 4) ages 10 civil
// days in 40 real seconds.
const ISSUE_TS = 1_791_000_000;

describe("bondDate", () => {
  it("runs on the demo clock: daySecs 4 → 10 civil days in 40 s", () => {
    expect(
      bondDate(
        "2026-10-09",
        { daySecs: 4, issueTs: ISSUE_TS },
        (ISSUE_TS + 40) * 1000,
      ),
    ).toEqual({
      day: 10,
      date: "2026-10-19",
    });
  });

  it("never returns a date before the issue date", () => {
    expect(
      bondDate("2026-10-09", { daySecs: 4, issueTs: ISSUE_TS }, 0),
    ).toEqual({
      day: 0,
      date: "2026-10-09",
    });
  });
});

describe("feed rows (task 91564)", () => {
  const ev = (id: number, kind: string, sig: string): ActivityLike => ({
    id,
    ts: id,
    kind,
    sig,
  });

  it("drops a scheduler row whose transaction also has its indexed event", () => {
    const rows = dedupeFeedActivity([
      ev(1, "SeriesInitialized", "sig1"),
      ev(2, "scheduler:pay_batch", "sig2"),
      ev(3, "EntitlementPaid", "sig2"), // same devnet transaction as the audit row
      ev(4, "scheduler:announce", "sig4"), // no indexed event yet: stays
    ]);
    expect(rows.map((r) => r.id)).toEqual([1, 3, 4]);
  });

  it("labels a remaining scheduler row as a sentence, never the raw kind", () => {
    expect(isSchedulerStep("scheduler:pay_batch")).toBe(true);
    expect(isSchedulerStep("EntitlementPaid")).toBe(false);
    expect(schedulerStep("scheduler:pay_batch")).toBe("pay batch");
    expect(schedulerStep("scheduler:snapshot_batch")).toBe("snapshot batch");
  });
});

describe("sandboxFailureKind (A91580-2)", () => {
  it("maps a raw executor refusal to the busy sentence and keeps the raw text for details", () => {
    const raw =
      "executor_failed: cli series:create refused: qupon: HTTP error (429): Too Many Requests";
    const e = { status: 502, code: "executor_failed", message: raw };
    expect(sandboxFailureKind(e)).toBe("busy"); // the friendly sentence, never the raw message
    expect(e.message).toBe(raw); // the collapsed technical details keep it verbatim
  });

  it("maps throttling to its own sentence", () => {
    expect(
      sandboxFailureKind({
        status: 429,
        code: "demo_throttled",
        message: "3/h",
      }),
    ).toBe("throttled");
    expect(
      sandboxFailureKind({ status: 0, code: "demo_throttled", message: "" }),
    ).toBe("throttled");
  });
});
