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
    listActivity(500).catch(() => []),
  ]);
  // The last *payout*: a completed coupon/redemption/call that actually paid someone (a meeting completes with 0).
  // Ranked so the first number a judge reads is a real tenge coupon, not a 6-decimal test redemption:
  // featured series first, then a coupon (INTR), then a non-USDC currency; newest only breaks ties (91550 #2).
  const rank = (
    e: ActivityLike,
    s: SeriesDTO,
  ): [number, number, number, number] => [
    Number(s.featured ?? false),
    Number(Number(e.payload?.kind ?? -1) === 0),
    Number(s.faceValue.currency !== "USDC"),
    e.ts,
  ];
  const done = activity
    .filter(
      (e) =>
        e.kind === "ActionCompleted" &&
        BigInt(String(e.payload?.total_paid ?? "0")) > 0n &&
        Number(e.payload?.holders_paid ?? 0) > 0,
    )
    .map((e) => ({ e, s: eventSeries(e, series) }))
    .filter((d): d is { e: ActivityLike; s: SeriesDTO } => d.s !== undefined)
    .sort((a, b) => {
      const ra = rank(a.e, a.s);
      const rb = rank(b.e, b.s);
      return rb[0] - ra[0] || rb[1] - ra[1] || rb[2] - ra[2] || rb[3] - ra[3];
    })[0]?.e;
  const p = done?.payload ?? {};
  const s = done ? eventSeries(done, series) : undefined;
  const activeOnes = series.filter((x) => x.status === "Active");
  const featuredActive = activeOnes.filter((x) => x.featured);
  return {
    activity,
    // Featured series when any exist (the curated showcase), otherwise every active series.
    active: featuredActive.length ? featuredActive : activeOnes,
    txCount: new Set(activity.map((e) => e.sig)).size,
    txMore: activity.length >= 500,
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
