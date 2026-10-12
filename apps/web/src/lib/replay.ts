import type { Sandbox, SandboxScenario, ScenarioKind } from "./sandbox";

/** One recorded GET /demo/sandbox/{id} body (task 91587): `t` = ms since the run started. */
export type ReplayFrame = { t: number; sandbox: Sandbox };

/** One recorded scenario response: POST /demo/sandbox/{id}/scenario at `t` ms since the run started. */
export type ReplayScenario = {
  t: number;
  scenario: ScenarioKind;
  result: SandboxScenario;
};

/** The file apps/web/public/replay/sandbox.json (committed empty by the lead; never fetched at build time). */
export type ReplayFile = {
  recordedAt: string;
  /** host the run was recorded from, nothing else */
  api: string;
  frames: ReplayFrame[];
  scenarios: ReplayScenario[];
};

/** Identical stretches are skipped by the recorder, so a gap only exists where something changed. */
export const REPLAY_GAP_MS = 3_000;
/** "Try it in 3 minutes": the whole run, gaps capped, still fits in three minutes. */
export const REPLAY_BUDGET_MS = 180_000;

/**
 * Playback time of each frame: every gap capped at `gapMs`, then the whole timeline scaled down if it still
 * exceeds `budgetMs` (a dense recording compresses uniformly instead of overrunning three minutes). The first
 * frame plays at 0 and the last frame's time is the total duration.
 */
export function planPlayback(
  frames: { t: number }[],
  gapMs = REPLAY_GAP_MS,
  budgetMs = REPLAY_BUDGET_MS,
): number[] {
  if (!frames.length) return [];
  const gaps = frames.map((f, i) =>
    i === 0 ? 0 : Math.max(0, Math.min(f.t - frames[i - 1]!.t, gapMs)),
  );
  const total = gaps.reduce((a, b) => a + b, 0);
  const scale = total > budgetMs ? budgetMs / total : 1;
  let acc = 0;
  return gaps.map((g) => Math.min(budgetMs, (acc += g) * scale));
}

/** A recorded scenario appears with the first frame at or after its recorded moment (the run's end if never). */
export function scenarioPlayAt(
  plan: number[],
  frames: { t: number }[],
  t: number,
): number {
  const i = frames.findIndex((f) => f.t >= t);
  return i === -1 ? (plan.at(-1) ?? 0) : plan[i]!;
}

/** The sandbox body to show at playback time `pt`: the frame's own scenarios plus the recorded ones due by now. */
export function mergeScenarios(
  s: Sandbox,
  scenarios: ReplayScenario[],
  playAt: (r: ReplayScenario) => number,
  pt: number,
): Sandbox {
  const due = scenarios.filter((r) => playAt(r) <= pt);
  if (!due.length) return s;
  const byKind = new Map(s.scenarios.map((x) => [x.kind, x] as const));
  for (const r of due) byKind.set(r.result.kind, r.result); // recorded wins: same run, newer read
  return { ...s, scenarios: [...byKind.values()] };
}

/** Coarse life-step of a sandbox body (the progress bar's segment names); mirrors the Now bar's cases. */
export function sandboxStep(s: Sandbox): string {
  if (s.series.status === "Closed") return "redeemed";
  const a =
    s.actions.find(
      (x) => x.status !== "Completed" && x.status !== "Cancelled",
    ) ?? s.actions.at(-1);
  if (!a) return "issued";
  switch (a.status) {
    case "Announced":
      return "announced";
    case "RecordStruck":
      return "snapshot";
    case "SnapshotComplete":
      return s.autofund ? "funding" : "skipped";
    case "Defaulted":
      return "defaulted";
    case "Funded":
      return "funded";
    case "Settling":
      return "paying";
    default:
      return "paid";
  }
}
