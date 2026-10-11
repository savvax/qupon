/** buildShowcasePlan: pure CLI-step plan per curated definition (task 91542; no network). */
import { describe, expect, it } from "vitest";
import {
  buildShowcasePlan,
  SHOWCASE_UNITS,
  seriesNameOf,
  type ShowcaseDef,
} from "./showcasePlan.js";

/** The four definitions of config/showcase.json (the Go Showcase table). */
const DEFS: readonly ShowcaseDef[] = [
  {
    scenario: "coupon",
    ticker: "Almaty Power",
    isin: "KZ2C0QPN0018",
    faceMinor: 100000,
    rateBps: 1000,
    frequency: 2,
    maturityMonths: 12,
    daySecs: 3600,
  },
  {
    scenario: "redemption",
    ticker: "Astana Metro",
    isin: "KZ2C0QPN0026",
    faceMinor: 100000,
    rateBps: 1000,
    frequency: 2,
    maturityMonths: 6,
    daySecs: 3600,
  },
  {
    scenario: "meeting",
    ticker: "Aktobe Mining",
    isin: "KZ2C0QPN0034",
    faceMinor: 100000,
    rateBps: 1000,
    frequency: 2,
    maturityMonths: 9,
    daySecs: 3600,
  },
  {
    scenario: "early_call",
    ticker: "Atyrau Oil",
    isin: "KZ2C0QPN0042",
    faceMinor: 100000,
    rateBps: 1000,
    frequency: 2,
    maturityMonths: 8,
    daySecs: 3600,
  },
];

const OPTS = {
  today: "2026-10-09",
  owners: ["owner1", "owner2", "owner3"],
  kp: (v: string) => `$${v}`,
} as const;

const argsOf = (step: { args?: readonly string[] }): readonly string[] =>
  step.args ?? [];
const join = (
  steps: readonly { args?: readonly string[] }[],
): readonly string[] => steps.flatMap(argsOf);

describe("buildShowcasePlan", () => {
  it("names every series legally for series:create (spaces become hyphens — on-chain tickers are ASCII-graphic)", () => {
    const plan = buildShowcasePlan(DEFS, OPTS);
    expect(plan.map((s) => s.name)).toEqual([
      "Almaty-Power",
      "Astana-Metro",
      "Aktobe-Mining",
      "Atyrau-Oil",
    ]);
    for (const s of plan) expect(s.name).toMatch(/^[A-Za-z0-9-]{1,16}$/);
    expect(seriesNameOf(DEFS[0]!)).toBe("Almaty-Power");
  });

  it("issues every series with the demo clock and subscribes 10 / 25 / 65", () => {
    const plan = buildShowcasePlan(DEFS, OPTS);
    for (const [i, s] of plan.entries()) {
      const create = argsOf(s.steps[0]!);
      expect(create).toContain("series:create");
      expect(create).toEqual(
        expect.arrayContaining([
          "--name",
          s.name,
          "--isin",
          s.def.isin,
          "--face",
          "100000",
          "--rate-bps",
          "1000",
          "--frequency",
          "2",
          "--day-count",
          "THIRTY_360",
          "--issue-date",
          "2026-10-09",
          "--cash",
          "tkzt",
          "--demo-day-secs",
          "3600",
        ]),
      );
      // maturity = issue + maturityMonths civil months (2026-10-09 → 2027-10-09, 2027-04-09, 2027-07-09, 2027-06-09)
      expect(create).toContain("--maturity-date");
      expect(create[create.indexOf("--maturity-date") + 1]).toBe(
        ["2027-10-09", "2027-04-09", "2027-07-09", "2027-06-09"][i],
      );
      // KYC + register every owner, then their subscription
      for (const k of [0, 1, 2]) {
        expect(join(s.steps)).toContainEqual("kyc:attest");
        expect(join(s.steps)).toContain("--owner");
        expect(join(s.steps)).toContain(`owner${k + 1}`);
        expect(join(s.steps)).toContain(`$QUPON_INVESTOR${k + 1}_KEYPAIR`);
      }
      const subs = s.steps.filter((st) => argsOf(st)[0] === "subscribe");
      expect(
        subs.map((st) => argsOf(st)[argsOf(st).indexOf("--units") + 1]),
      ).toEqual(SHOWCASE_UNITS.map(String));
      // CORP ids fit the on-chain 16-byte corp_id field
      const flat = join(s.steps);
      for (const [idx, a] of flat.entries()) {
        if (flat[idx - 1] === "--corp-id")
          expect(a.length).toBeLessThanOrEqual(16);
      }
    }
  });

  it("drives each scenario to its dossier state", () => {
    const plan = buildShowcasePlan(DEFS, OPTS);
    const coupon = plan[0]!;
    expect(join(coupon.steps)).toEqual(
      expect.arrayContaining(["action:announce", "--kind", "INTR"]),
    );
    // Explicit near-term dates (task 91553): on the 1 h clock the derived record would sit ~7 real
    // days out, so every scenario pins its own timestamps — now < record ≤ payment holds at run time.
    expect(join(coupon.steps)).toEqual(
      expect.arrayContaining(["--record-at", "+60", "--payment-at", "+120"]),
    );
    expect(coupon.steps[coupon.steps.length - 1]!.args?.[0]).toBe(
      "action:complete",
    ); // first coupon paid
    expect(coupon.steps.filter((s) => s.wait === "record")).toHaveLength(1);
    expect(coupon.steps.filter((s) => s.wait === "payment")).toHaveLength(1);

    const redemption = plan[1]!;
    expect(join(redemption.steps)).toEqual(
      expect.arrayContaining(["--kind", "REDM"]),
    );
    expect(join(redemption.steps)).toEqual(
      expect.arrayContaining(["--record-at", "+60", "--payment-at", "+120"]),
    );
    expect(redemption.steps.slice(-2).map((s) => s.args?.[0])).toEqual([
      "action:retire",
      "series:close",
    ]); // redeemed and closed

    const meeting = plan[2]!;
    const votes = meeting.steps.filter((s) => s.args?.[0] === "vote");
    expect(
      votes.map((v) => [
        v.args?.[v.args.indexOf("--choice") + 1],
        v.args?.at(-1),
      ]),
    ).toEqual([
      ["for", "$QUPON_INVESTOR3_KEYPAIR"],
      ["against", "$QUPON_INVESTOR2_KEYPAIR"],
    ]);
    expect(join(meeting.steps)).toContain("meeting:announce");
    // voting open ~3 real days (259 200 s); record 30 s out so the snapshot follows at once
    expect(join(meeting.steps)).toEqual(
      expect.arrayContaining([
        "--record-at",
        "+30",
        "--voting-ends-at",
        "+259200",
      ]),
    );
    expect(join(meeting.steps)).not.toContain("meeting:finalize"); // voting stays open

    const earlyCall = plan[3]!;
    const announce = join(earlyCall.steps);
    expect(announce).toEqual(
      expect.arrayContaining(["--kind", "MCAL", "--call-date", "2027-02-09"]),
    ); // issue + 4 months < first coupon (+6)
    // record/payment ~1 real day ahead — the autopilot completes the call after they pass
    expect(announce).toEqual(
      expect.arrayContaining([
        "--record-at",
        "+86400",
        "--payment-at",
        "+90000",
      ]),
    );
    expect(
      earlyCall.steps.filter((s) => s.args).map((s) => s.args![0]),
    ).toEqual([
      "series:create",
      "kyc:attest",
      "investor:register",
      "kyc:attest",
      "investor:register",
      "kyc:attest",
      "investor:register",
      "subscribe",
      "subscribe",
      "subscribe",
      "action:announce",
    ]);
  });

  it("skips definitions whose ISIN is already on chain (idempotent re-runs)", () => {
    const plan = buildShowcasePlan(DEFS, {
      ...OPTS,
      existing: new Set(["KZ2C0QPN0018"]),
    });
    expect(plan.map((s) => s.skip)).toEqual([true, false, false, false]);
    expect(plan[0]!.steps).toEqual([]); // nothing to run
    expect(plan[1]!.steps.length).toBeGreaterThan(0);
  });
});
