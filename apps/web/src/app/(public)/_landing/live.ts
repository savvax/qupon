import {
  type ActivityLike,
  eventSeries,
  listActivity,
  listPublicSeries,
  type SeriesDTO,
} from "@/lib/api";

/** ISO 20022 event codes in on-chain `ActionKind` order (state.rs). */
export const KIND_CODES = [
  "INTR",
  "REDM",
  "MCAL",
  "PCAL",
  "BMET",
  "CHAN",
] as const;

export type LastAction = {
  ticker: string;
  kind: (typeof KIND_CODES)[number];
  totalMinor: string;
  currency: string;
  holders: number;
  sig?: string;
  /** When it completed (ISO 8601). */
  at?: string;
  /** The action account (landing money flow). */
  actionPda?: string;
  mint?: string;
};

export type Live = {
  activity: ActivityLike[];
  active: SeriesDTO[];
  txCount: number;
  txMore: boolean;
  last?: LastAction;
};

/** Landing data from the public API; any failure degrades to empty (the page renders static content). */
export async function loadLive(): Promise<Live> {
  const [series, activity] = await Promise.all([
    listPublicSeries().catch(() => [] as SeriesDTO[]),
    listActivity(200).catch(() => []),
  ]);
  // The last *payout*: a completed coupon/redemption/call that actually paid someone (a meeting completes with 0).
  const done = activity
    .filter(
      (e) =>
        e.kind === "ActionCompleted" &&
        BigInt(String(e.payload?.total_paid ?? "0")) > 0n &&
        Number(e.payload?.holders_paid ?? 0) > 0,
    )
    .sort((a, b) => b.ts - a.ts)[0];
  const p = done?.payload ?? {};
  const s = done ? eventSeries(done, series) : undefined;
  return {
    activity,
    active: series.filter((x) => x.status === "Active"),
    txCount: new Set(activity.map((e) => e.sig)).size,
    txMore: activity.length >= 200,
    last:
      done && s
        ? {
            ticker: s.ticker,
            kind: KIND_CODES[Number(p.kind ?? 0)] ?? "INTR",
            totalMinor: String(p.total_paid ?? "0"),
            currency: s.faceValue.currency,
            holders: Number(p.holders_paid ?? 0),
            sig: done.sig,
            at: new Date(done.ts * 1000).toISOString(),
            actionPda: done.actionPda ?? done.action_pda ?? undefined,
            mint: s.mint,
          }
        : undefined,
  };
}

/** The brief's coupon (10 / 25 / 65 bonds → 500 / 1 250 / 3 250 ₸) when the API has nothing to show. */
export const EXAMPLE_ACTION: LastAction = {
  ticker: "QPNb1",
  kind: "INTR",
  totalMinor: "500000",
  currency: "tKZT",
  holders: 3,
};
