import { listActivity, listPublicSeries, type SeriesDTO } from "@/lib/api";

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
};

export type Live = {
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
  const done = activity
    .filter((e) => e.kind === "ActionCompleted")
    .sort((a, b) => b.ts - a.ts)[0];
  const p = done?.payload ?? {};
  const s = series.find((x) => x.mint === (done?.seriesMint ?? p.series));
  return {
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
