import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Icon } from "@/components/shell/icons";
import { formatDate } from "@/lib/format";
import type { ActionDTO, SeriesDTO } from "@/lib/api";
import { cx } from "@/lib/ui/cx";

// Alert logic (deriveAlerts) lives in ./alerts so vitest can import it — a .tsx
// module is not transformable from a .ts test under this repo's vitest config.
export { deriveAlerts, ALERT_TONE } from "./alerts";
import { ALERT_TONE, type ActionAlert } from "./alerts";
export type { ActionAlert, AlertKind } from "./alerts";

/**
 * Pipeline column: status key (label via status.*) → the statuses bucketed there. Defaulted (plan 15 D4) is
 * its own red column: a board that hides a default is lying to the operator.
 */
const COLUMNS: ReadonlyArray<{
  key: string;
  statuses: readonly string[];
  accent?: "default";
}> = [
  { key: "Announced", statuses: ["Announced"] },
  { key: "RecordStruck", statuses: ["RecordStruck"] },
  // Meetings sit here: the record is struck and the snapshot weights are live while voting is open.
  { key: "SnapshotComplete", statuses: ["SnapshotComplete", "VotingOpen"] },
  { key: "Defaulted", statuses: ["Defaulted"], accent: "default" },
  { key: "Funded", statuses: ["Funded"] },
  { key: "Settling", statuses: ["Settling", "Retiring"] },
  { key: "Completed", statuses: ["Completed", "Finalized"] },
];

function ActionCard({
  action,
  ticker,
  locale,
  bankLabel,
}: {
  action: ActionDTO;
  ticker: string;
  locale: string;
  /** sr-only "Paid to agent": the bank chip is an icon, but its meaning stays in text (§7) */
  bankLabel: string;
}) {
  const bank = action.bankPending ?? 0;
  return (
    <Link
      href={`/registrar/actions/${action.pda}`}
      title={action.corpId}
      className={cx(
        "qp-lift block rounded-btn border bg-n0 px-3 py-2.5 text-sm hover:border-g300 hover:bg-g50",
        action.status === "Defaulted" ? "border-default/40" : "border-n200",
      )}
    >
      {/* Stacked, not side by side: in a narrow column the badge used to squeeze the ticker down to "Q.". */}
      {/* break-words, never truncate: the whole ticker is readable at 1440 and 390 (task 1534). */}
      <div className="num break-words font-bold">{ticker}</div>
      {/* The kind chip carries the ISO code, not the translated word ("Coupon"/"Купон" wrap to a
          different number of lines → cards change height between locales, which the locale-stability
          spec forbids); the word stays on the wide alerts rows below. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="info" wrap>
          {action.kind}
        </Badge>
        {bank > 0 && (
          <Badge tone="bank">
            {bank} <Icon name="bank" className="size-3.5" aria-hidden />
            <span className="sr-only">{bankLabel}</span>
          </Badge>
        )}
      </div>
      <div className="num mt-1 text-xs whitespace-nowrap text-n500">
        {formatDate(action.recordAt, locale)}
      </div>
    </Link>
  );
}

/** Pipeline of action cards: seven equal columns from 1280 px, 210 px scrolling columns from 640 px; on phones
 * a vertical list of the non-empty stages. Tickers wrap (break-words) — nothing is ever cut to "Q.". */
export async function Pipeline({
  actions,
  series,
}: {
  actions: ActionDTO[];
  series: SeriesDTO[];
}) {
  const t = await getTranslations("status");
  const locale = await getLocale();
  const dash = await getTranslations("registrar.dash");
  const tickerOf = new Map(series.map((s) => [s.mint, s.ticker] as const));
  return (
    <Card>
      <h2 className="text-base font-bold">{dash("pipeline")}</h2>
      <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:gap-3 sm:overflow-x-auto sm:pb-1 xl:grid xl:grid-cols-7 xl:overflow-visible">
        {COLUMNS.map((col) => {
          const inStage = actions.filter((a) =>
            col.statuses.includes(a.status),
          );
          return (
            <section
              key={col.key}
              className={cx(
                "min-w-0 sm:w-[210px] sm:shrink-0 xl:w-auto",
                inStage.length === 0 && "max-sm:hidden",
              )}
            >
              <h3
                className={cx(
                  // min-h-8: the longest label (KK "Тіркеу күні белгіленді") wraps to two lines —
                  // reserving both keeps every column's cards at the same y in every locale.
                  // Sentence case (§2): tracked caps wrapped mid-word (preflight #10).
                  "mb-2 flex min-h-[2rem] items-baseline gap-1.5 text-xs font-bold",
                  col.accent === "default" ? "text-default" : "text-n500",
                )}
              >
                {t(col.key)}
                {/* count on every column: the board is dense, an empty column still shows its 0 */}
                <span
                  className={cx(
                    "num ml-auto rounded-full px-1.5 text-micro",
                    inStage.length > 0 && col.accent === "default"
                      ? "bg-default text-white"
                      : "bg-n100 text-n500",
                  )}
                >
                  {inStage.length}
                </span>
              </h3>
              <div className="flex flex-col gap-2">
                {inStage.length === 0 && (
                  <span className="px-3 text-sm text-n400">—</span>
                )}
                {inStage.map((a) => (
                  <ActionCard
                    locale={locale}
                    key={a.pda}
                    action={a}
                    bankLabel={t("PaidToAgent")}
                    ticker={
                      tickerOf.get(a.seriesMint) ??
                      a.seriesMint.slice(0, 4) + "…"
                    }
                  />
                ))}
              </div>
            </section>
          );
        })}
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
  // StableText: the alerts sit above the pipeline now (preflight #10), so a row's height must not
  // move with the language — each text reserves the height of its longest locale (spec §5.8).
  const text = (a: ActionAlert): ReactNode =>
    a.kind === "bankPending" ? (
      <StableText
        template={dash.raw(a.kind) as string}
        values={{ count: a.action.bankPending ?? 0 }}
      >
        {dash(a.kind, { count: a.action.bankPending ?? 0 })}
      </StableText>
    ) : (
      <StableText>{dash(a.kind)}</StableText>
    );
  if (alerts.length === 0)
    return <p className="text-sm text-n500">{dash("noAlerts")}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map(({ kind, action }) => (
        <li key={`${kind}:${action.pda}`}>
          <Link
            href={`/registrar/actions/${action.pda}`}
            className={cx(
              "flex items-start gap-2 rounded-btn border px-3 py-2 text-sm transition-colors",
              ALERT_TONE[kind] === "danger"
                ? "border-default/40 bg-err-bg text-err-fg hover:brightness-[0.98]"
                : ALERT_TONE[kind] === "bank"
                  ? "border-bank-bd bg-bank-bg text-bank-fg hover:brightness-[0.98]"
                  : kind === "cancelled"
                    ? "border-n200 bg-n50 text-n700 hover:bg-n100"
                    : "border-warn-bd bg-warn-bg text-warn-fg hover:brightness-[0.98]",
            )}
          >
            <Badge
              tone={
                ALERT_TONE[kind] === "danger"
                  ? "danger"
                  : ALERT_TONE[kind] === "bank"
                    ? "bank"
                    : kind === "cancelled"
                      ? "neutral"
                      : "warn"
              }
              dot={false}
            >
              {kinds(action.kind)}
            </Badge>
            <span className="min-w-0 flex-1">{text({ kind, action })}</span>
            <span className="num hidden text-xs opacity-80 sm:inline">
              {action.corpId}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
