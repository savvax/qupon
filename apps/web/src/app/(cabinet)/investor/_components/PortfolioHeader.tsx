"use client";

/**
 * Investor portfolio (Plan 3 Task 6 step 1): petrol header with the portfolio
 * KPIs and the KYC chip, holding cards and the entitlement-history table.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { KIND_TONE } from "@/lib/ui/badge";
import { Button } from "@/components/ui/Button";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { paidTxByOwner } from "@/lib/actionFlow";
import { listActivity } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useInvestor } from "./InvestorIdentity";
import { HoldingsList } from "./HoldingsList";
import { OpenTrades } from "./OpenTrades";
import {
  faceTotals,
  nextPayment,
  receivedToDate,
  type CurrencyTotal,
} from "../_lib/investorStats";
import { usePortalRows } from "../_lib/usePortalRows";

function Money({
  totals,
  locale,
}: {
  totals: CurrencyTotal[];
  locale: "en" | "ru";
}) {
  if (totals.length === 0) return <span>—</span>;
  return (
    <>
      {totals.map((t, i) => (
        // one line per currency: amounts in different units are never added up
        <span
          key={t.currency}
          className={i > 0 ? "mt-1 block text-lg" : "block"}
        >
          <Amount minor={t.minor} currency={t.currency} locale={locale} />
        </span>
      ))}
    </>
  );
}

/** Petrol KPI band: face value total, received to date, next payment. */
function PortfolioHeader({ rows }: { rows: Parameters<typeof faceTotals>[0] }) {
  const t = useTranslations("investor.portfolio");
  const locale = useLocale() as "en" | "ru";
  const next = nextPayment(rows);
  const registered = rows.filter((r) => r.me !== undefined);
  const kyc = registered.some((r) => r.me?.status === "Suspended")
    ? { tone: "danger", label: t("kycSuspended") }
    : registered.length > 0
      ? { tone: "success", label: t("kycOk") }
      : { tone: "neutral", label: t("kycNone") };
  const kpiLabel = "text-xs font-bold uppercase tracking-wider text-p100";
  const kpiValue =
    "num mt-1.5 text-2xl font-extrabold [&_.text-n500]:text-p100";

  return (
    <section className="relative overflow-hidden rounded-hero bg-p900 p-6 text-white sm:p-8">
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(90%_80%_at_100%_0%,var(--color-p500)_0%,transparent_60%)] opacity-60"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Badge tone={kyc.tone}>
          {kyc.label}
          <span className="ml-1 font-normal opacity-80">(SAS · SIMULATED)</span>
        </Badge>
      </div>
      <div className="relative mt-5 grid gap-5 sm:grid-cols-3">
        <div className="min-w-0">
          <div className={kpiLabel}>{t("faceTotal")}</div>
          <div className={kpiValue}>
            <Money totals={faceTotals(rows)} locale={locale} />
          </div>
        </div>
        <div className="min-w-0">
          <div className={kpiLabel}>{t("receivedToDate")}</div>
          <div className={kpiValue}>
            <Money totals={receivedToDate(rows)} locale={locale} />
          </div>
        </div>
        <div className="min-w-0">
          <div className={kpiLabel}>{t("nextPayment")}</div>
          <div className={kpiValue}>
            {next?.est ? (
              <Amount
                minor={next.est.minor}
                currency={next.est.currency}
                locale={locale}
              />
            ) : (
              "—"
            )}
          </div>
          {next && (
            <div className="num mt-1 text-sm text-p100">
              {formatDate(next.date, locale)}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/** The /investor page body inside <InvestorIdentity>. */
export function PortfolioView() {
  const { owner } = useInvestor();
  const t = useTranslations("investor.portfolio");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ru";
  const { rows, error, reload } = usePortalRows();

  // actionPda → owner → EntitlementPaid signature (last-payment tx on the cards)
  const [paidTxs, setPaidTxs] = useState<Map<
    string,
    Map<string, string>
  > | null>(null);
  useEffect(() => {
    if (!rows) return;
    let live = true;
    listActivity(200)
      .then((activity) => {
        if (!live) return;
        const map = new Map<string, Map<string, string>>();
        for (const row of rows)
          for (const a of row.actions)
            if (!map.has(a.pda)) map.set(a.pda, paidTxByOwner(activity, a.pda));
        setPaidTxs(map);
      })
      .catch(() => live && setPaidTxs(new Map()));
    return () => {
      live = false;
    };
  }, [rows]);

  if (error) {
    return (
      <EmptyState
        title={t("loadFailed")}
        body={error}
        action={
          <Button variant="secondary" onClick={reload}>
            {tc("retry")}
          </Button>
        }
      />
    );
  }
  if (!rows || !paidTxs) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36 rounded-hero" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
          <Skeleton className="h-56" />
        </div>
      </div>
    );
  }

  const lastTxByMint = new Map<string, string>();
  for (const row of rows) {
    const lastPaid = [...row.entitlements]
      .filter((e) => e.status === "Paid")
      .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
    const sig = lastPaid && paidTxs.get(lastPaid.actionPda)?.get(owner);
    if (sig) lastTxByMint.set(row.series.mint, sig);
  }

  // One row per entitlement account, attributed to the series whose action it belongs to.
  const candidates = rows
    .flatMap((row) =>
      row.entitlements.map((e) => ({
        e,
        row,
        action: row.actions.find((a) => a.pda === e.actionPda),
      })),
    )
    .sort((x, y) => Number(!x.action) - Number(!y.action));
  const seen = new Set<string>();
  const history: typeof candidates = [];
  for (const h of candidates) {
    if (seen.has(h.e.pda)) continue;
    seen.add(h.e.pda);
    history.push(h);
  }

  type HistoryRow = (typeof history)[number];
  const historyColumns: Column<HistoryRow>[] = [
    {
      key: "action",
      header: t("col.action"),
      render: ({ e, row, action }) => (
        <span className="text-left">
          <span className="font-semibold">
            {action?.corpId ?? e.actionPda.slice(0, 8)}
          </span>
          <span className="block text-xs text-n500">{row.series.ticker}</span>
        </span>
      ),
    },
    {
      key: "kind",
      header: t("col.kind"),
      hideBelow: "lg",
      render: ({ action }) =>
        action ? (
          <Badge tone={KIND_TONE[action.kind] ?? "neutral"}>
            {action.kind}
          </Badge>
        ) : (
          "—"
        ),
    },
    {
      key: "units",
      header: t("col.units"),
      align: "right",
      render: ({ e }) => <span className="num">{e.units}</span>,
    },
    {
      key: "gross",
      header: t("col.gross"),
      align: "right",
      hideBelow: "lg",
      render: ({ e }) =>
        e.gross ? (
          <Amount
            minor={e.gross.minor}
            currency={e.gross.currency}
            locale={locale}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "net",
      header: t("col.net"),
      align: "right",
      essential: true,
      render: ({ e }) =>
        e.net ? (
          <Amount
            minor={e.net.minor}
            currency={e.net.currency}
            locale={locale}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: t("col.status"),
      essential: true,
      render: ({ e }) => <Badge status={e.status} />,
    },
    {
      key: "vote",
      header: t("col.vote"),
      hideBelow: "lg",
      render: ({ e }) =>
        e.vote && e.vote !== "None" ? (
          <Badge status={e.vote} />
        ) : (
          <span className="text-n400">—</span>
        ),
    },
    {
      key: "record",
      header: t("col.record"),
      hideBelow: "md",
      essential: true,
      render: ({ e, action }) => (
        <span className="num text-xs">
          {action ? formatDateTime(action.recordAt, locale) : "—"}
          {e.paidAt && (
            <span className="block text-n500">
              {t("paidOn", { date: formatDate(e.paidAt, locale) })}
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PortfolioHeader rows={rows} />

      <OpenTrades rows={rows} />

      <section aria-labelledby="holdings">
        <h2 id="holdings" className="mb-3 text-lg font-bold">
          {t("holdings")}
        </h2>
        <HoldingsList rows={rows} paidTxs={lastTxByMint} />
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-bold">
          {t("history")}
        </h2>
        {history.length === 0 ? (
          <EmptyState title={t("historyEmpty")} body={t("historyEmptyBody")} />
        ) : (
          <DataTable
            rows={history}
            rowKey={(h) => h.e.pda}
            columns={historyColumns}
          />
        )}
      </section>
    </div>
  );
}
