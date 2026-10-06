import {
  apiGet,
  listActions,
  listSeries,
  MOCK_API,
  type ActionDTO,
  type SeriesDTO,
} from "@/lib/api";
import { getSession } from "@/lib/session";

/** The issuer's series: filtered by ISSUER_PUBKEY when the deployment sets it (single-issuer demo: all series). */
export async function issuerSeries(): Promise<SeriesDTO[]> {
  const all = await listSeries().catch(() => [] as SeriesDTO[]);
  const issuer = process.env.ISSUER_PUBKEY;
  if (issuer) return all.filter((s) => s.issuer === issuer);
  if (MOCK_API) {
    // Mock mode mirrors task 807's issuerOwnsSeries: the cabinet lists only the
    // organisation's series (series_settings.org_id); an unassigned series stays out.
    const user = await getSession();
    if (user?.orgId) {
      const settings = await apiGet<{
        series: { mint: string; orgId: number | null }[];
      }>("/admin/series").catch(() => null);
      if (settings) {
        const mine = new Set(
          settings.series
            .filter((r) => r.orgId === user.orgId)
            .map((r) => r.mint),
        );
        return all.filter((s) => mine.has(s.mint));
      }
    }
  }
  return all;
}

export type ActionRow = { a: ActionDTO; s: SeriesDTO };

export async function issuerActions(series: SeriesDTO[]): Promise<ActionRow[]> {
  const lists = await Promise.all(
    series.map((s) =>
      listActions(s.mint)
        .then((as) => as.map((a) => ({ a, s })))
        .catch(() => [] as ActionRow[]),
    ),
  );
  return lists.flat().sort((x, y) => y.a.recordAt.localeCompare(x.a.recordAt));
}

/** Escrow still missing for an action that is waiting for funds (Σ net + tax − escrow; principal is not in the DTO). */
export function escrowShortfall(a: ActionDTO): bigint {
  if (a.status !== "SnapshotComplete") return 0n;
  const need =
    BigInt(a.totalNet?.minor ?? "0") + BigInt(a.totalTax?.minor ?? "0");
  const have = BigInt(a.escrowBalance?.minor ?? "0");
  return need > have ? need - have : 0n;
}
