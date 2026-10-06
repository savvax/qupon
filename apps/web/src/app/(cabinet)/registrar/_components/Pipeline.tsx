import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { formatDate } from "@/lib/format";
import type { ActionDTO, SeriesDTO } from "@/lib/api";
import { cx } from "@/lib/ui/cx";

/** Pipeline column: status key (label via status.*) → the statuses bucketed there. */
const COLUMNS: ReadonlyArray<{ key: string; statuses: readonly string[] }> = [
  { key: "Announced", statuses: ["Announced"] },
  { key: "RecordStruck", statuses: ["RecordStruck"] },
  // Meetings sit here: the record is struck and the snapshot weights are live while voting is open.
  { key: "SnapshotComplete", statuses: ["SnapshotComplete", "VotingOpen"] },
  { key: "Funded", statuses: ["Funded"] },
  { key: "Settling", statuses: ["Settling", "Retiring"] },
  { key: "Completed", statuses: ["Completed", "Finalized"] },
];

export type AlertKind = "recordDatePassed" | "escrowShort" | "cancelled";

export type ActionAlert = { kind: AlertKind; action: ActionDTO };

/** Conditions the registrar must react to (Plan 3 Task 3 alerts list). */
export function deriveAlerts(
  actions: ActionDTO[],
  now = new Date(),
): ActionAlert[] {
  const out: ActionAlert[] = [];
  for (const a of actions) {
    if (a.status === "Announced" && new Date(a.recordAt) < now)
      out.push({ kind: "recordDatePassed", action: a });
    // Required = Σ net + withheld tax (principal is per-unit only until redemption totals land).
    if (
      a.status === "SnapshotComplete" &&
      a.escrowBalance &&
      a.totalNet &&
      a.totalTax
    ) {
      const required = BigInt(a.totalNet.minor) + BigInt(a.totalTax.minor);
      if (BigInt(a.escrowBalance.minor) < required)
        out.push({ kind: "escrowShort", action: a });
    }
    if (a.status === "Cancelled") out.push({ kind: "cancelled", action: a });
  }
  return out;
}

function ActionCard({
  action,
  ticker,
  kindLabel,
}: {
  action: ActionDTO;
  ticker: string;
  kindLabel: string;
}) {
  return (
    <Link
      href={`/registrar/actions/${action.pda}`}
      className="qp-lift block rounded-btn border border-n200 bg-n0 px-3 py-2.5 text-sm hover:border-g300 hover:bg-g50"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="num truncate font-bold">{ticker}</span>
        <Badge tone="info">{kindLabel}</Badge>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 text-xs text-n500">
        <span className="num">{formatDate(action.recordAt)}</span>
        <span className="num truncate">{action.corpId}</span>
      </div>
    </Link>
  );
}

/** Horizontal pipeline of action cards; scrolls on mobile. */
export async function Pipeline({
  actions,
  series,
}: {
  actions: ActionDTO[];
  series: SeriesDTO[];
}) {
  const t = await getTranslations("status");
  const kinds = await getTranslations("landing.kinds");
  const dash = await getTranslations("registrar.dash");
  const tickerOf = new Map(series.map((s) => [s.mint, s.ticker] as const));
  return (
    <Card>
      <h2 className="text-base font-bold">{dash("pipeline")}</h2>
      <div className="mt-3 flex gap-3 overflow-x-auto pb-1">
        {COLUMNS.map((col) => (
          <section key={col.key} className="w-44 shrink-0">
            <h3 className="mb-2 text-xs font-bold tracking-wide text-n500 uppercase">
              {t(col.key)}
            </h3>
            <div className="flex flex-col gap-2">
              {actions
                .filter((a) => col.statuses.includes(a.status))
                .map((a) => (
                  <ActionCard
                    key={a.pda}
                    action={a}
                    ticker={
                      tickerOf.get(a.seriesMint) ??
                      a.seriesMint.slice(0, 4) + "…"
                    }
                    kindLabel={kinds(a.kind)}
                  />
                ))}
            </div>
          </section>
        ))}
      </div>
      {actions.length === 0 && (
        <p className="mt-3 text-sm text-n500">{dash("empty")}</p>
      )}
    </Card>
  );
}

/** Attention list derived from live action state. */
export async function Alerts({ alerts }: { alerts: ActionAlert[] }) {
  const dash = await getTranslations("registrar.dash");
  const kinds = await getTranslations("landing.kinds");
  const text = (a: ActionAlert): ReactNode => dash(a.kind);
  if (alerts.length === 0)
    return <p className="text-sm text-n500">{dash("noAlerts")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map(({ kind, action }) => (
        <li key={`${kind}:${action.pda}`}>
          <Link
            href={`/registrar/actions/${action.pda}`}
            className={cx(
              "flex items-center gap-2 rounded-btn border px-3 py-2 text-sm transition-colors",
              kind === "cancelled"
                ? "border-n200 bg-n50 text-n700 hover:bg-n100"
                : "border-warn-bd bg-warn-bg text-warn-fg hover:brightness-[0.98]",
            )}
          >
            <Badge tone={kind === "cancelled" ? "neutral" : "warn"} dot={false}>
              {kinds(action.kind)}
            </Badge>
            <span className="min-w-0 flex-1 truncate">
              {text({ kind, action })}
            </span>
            <span className="num hidden text-xs opacity-80 sm:inline">
              {action.corpId}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
