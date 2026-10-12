import { describe, expect, it } from "vitest";
import {
  activityKindLabel,
  badgeTone,
  prettifyStatus,
  type RootT,
} from "./badge";

/** A translator over the real message keys activityKindLabel reads (en values inlined). */
const en = {
  "status.SeriesClosed": "Series closed",
  "steps.done.pay": "Paid",
  "steps.done.sweep": "Escrow swept",
  "steps.done.confirm_bank": "Bank payout confirmed",
  "landing.kinds.INTR": "Coupon",
  "registrar.activity.actor.advance": "Console",
  "registrar.activity.actor.scheduler": "Autopilot",
} as const;
const t = ((key: string) =>
  (en as Record<string, string>)[key] ?? key) as RootT;
t.has = (key: string) => key in en;

describe("badge", () => {
  it("maps known statuses to tones", () => {
    expect(badgeTone("Paid").fg).toBe("text-g700");
    expect(badgeTone("Suspended").fg).toBe("text-err-fg");
    expect(badgeTone("Funded").fg).toBe("text-warn-fg");
  });
  it("unknown statuses are neutral, never throw", () => {
    expect(badgeTone("SomethingNew").fg).toBe("text-n600");
  });
  it("prettifies camel case", () => {
    expect(prettifyStatus("RecordStruck")).toBe("Record struck");
  });
});

describe("activityKindLabel (live-sweep A91567-5)", () => {
  it("bare event kinds keep their status.* translation", () => {
    expect(activityKindLabel("SeriesClosed", t)).toBe("Series closed");
  });
  it("advance:/scheduler:/approval:step: rows read actor + steps.done.*, never the raw enum", () => {
    expect(activityKindLabel("advance:pay_batch", t)).toBe("Console: Paid");
    expect(activityKindLabel("scheduler:sweep_escrow", t)).toBe(
      "Autopilot: Escrow swept",
    );
    expect(activityKindLabel("approval:step:confirm_bank_payout", t)).toBe(
      "approval: Bank payout confirmed", // actor key missing → falls back to the raw prefix
    );
  });
  it("announce rows name the action kind; unknown kinds prettify instead of leaking", () => {
    expect(activityKindLabel("scheduler:INTR", t)).toBe("Autopilot: Coupon");
    expect(activityKindLabel("SomethingNew", t)).toBe("Something new");
    expect(activityKindLabel("scheduler:brand_new_step", t)).toBe(
      "Autopilot: brand new step",
    );
  });
});
