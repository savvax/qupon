import { describe, expect, it } from "vitest";
import {
  mergeScenarios,
  planPlayback,
  REPLAY_BUDGET_MS,
  scenarioPlayAt,
  sandboxStep,
  type ReplayScenario,
} from "./replay";
import type { Sandbox } from "./sandbox";

const fr = (t: number) => ({ t });

describe("planPlayback", () => {
  it("caps every gap at 3 s and keeps the first frame at 0", () => {
    expect(planPlayback([fr(0), fr(60_000), fr(60_500), fr(130_000)])).toEqual([
      0, 3_000, 3_500, 6_500,
    ]);
  });

  it("ends exactly on the last frame", () => {
    expect(planPlayback([fr(0), fr(10_000), fr(14_000)]).at(-1)).toBe(6_000);
  });

  it("a 9-minute recording plays within 180 s, sparse or dense", () => {
    // sparse: 18 changed frames 30 s apart → 17 gaps × 3 s = 51 s
    const sparse = planPlayback(
      Array.from({ length: 18 }, (_, i) => fr(i * 30_000)),
    );
    expect(sparse.at(-1)).toBe(51_000);
    // dense worst case: a change every 2 s for 9 minutes → capped total 540 s is scaled to the budget
    const dense = planPlayback(
      Array.from({ length: 271 }, (_, i) => fr(i * 2_000)),
    );
    expect(dense.at(-1)!).toBeLessThanOrEqual(REPLAY_BUDGET_MS);
    expect(dense.every((p, i) => i === 0 || p >= dense[i - 1]!)).toBe(true);
  });
});

describe("scenarioPlayAt", () => {
  const frames = [fr(0), fr(10_000), fr(20_000)];
  const plan = planPlayback(frames);

  it("places a scenario at the first frame at or after its recorded time", () => {
    expect(scenarioPlayAt(plan, frames, 5_000)).toBe(plan[1]);
    expect(scenarioPlayAt(plan, frames, 12_000)).toBe(plan[2]);
    expect(scenarioPlayAt(plan, frames, 10_000)).toBe(plan[1]); // exactly on a frame
  });

  it("a scenario after the last frame lands on the run's end", () => {
    expect(scenarioPlayAt(plan, frames, 99_000)).toBe(plan.at(-1));
  });
});

describe("mergeScenarios", () => {
  const rec = (kind: string, at: number): ReplayScenario =>
    ({ t: 0, scenario: kind, result: { kind, at, signatures: [] } }) as never;
  const at = (r: ReplayScenario) =>
    r.result.kind === "dvp_trade" ? 6_000 : 3_000;
  const base = { scenarios: [] } as unknown as Sandbox;

  it("shows only the recorded scenarios due by the playback time, newest per kind", () => {
    const list = [rec("dvp_trade", 2), rec("non_kyc_transfer", 3)];
    expect(
      mergeScenarios(base, list, at, 3_000).scenarios.map((x) => x.kind),
    ).toEqual(["non_kyc_transfer"]);
    expect(
      mergeScenarios(base, list, at, 6_000).scenarios.map((x) => x.kind),
    ).toEqual(["dvp_trade", "non_kyc_transfer"]);
    // a recorded result replaces the frame's own read of the same kind
    const withFrame = {
      scenarios: [{ kind: "dvp_trade", at: 1, signatures: [] }],
    } as never;
    expect(
      mergeScenarios(withFrame as Sandbox, [rec("dvp_trade", 2)], at, 6_000)
        .scenarios,
    ).toEqual([{ kind: "dvp_trade", at: 2, signatures: [] }]);
  });
});

describe("sandboxStep", () => {
  const s = (patch: Record<string, unknown>): Sandbox =>
    ({ series: { status: "Active" }, actions: [], ...patch }) as never;

  it("follows the bond's life", () => {
    expect(sandboxStep(s({}))).toBe("issued");
    expect(sandboxStep(s({ actions: [{ status: "Announced" }] }))).toBe(
      "announced",
    );
    expect(sandboxStep(s({ actions: [{ status: "Completed" }] }))).toBe("paid");
    expect(sandboxStep(s({ series: { status: "Closed" } }))).toBe("redeemed");
    expect(
      sandboxStep(
        s({ autofund: false, actions: [{ status: "SnapshotComplete" }] }),
      ),
    ).toBe("skipped");
  });
});
