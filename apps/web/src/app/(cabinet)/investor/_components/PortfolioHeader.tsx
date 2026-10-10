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
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { Skeleton } from "@/components/ui/Skeleton";
import { paidTxByOwner } from "@/lib/actionFlow";
import { listActivity } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { useInvestor } from "./InvestorIdentity";
import { HoldingsList } from "./HoldingsList";
import { OpenTrades } from "./OpenTrades";
import {
  claimableNow,
  daysUntil,
  faceTotals,
  nextPayment,
  receivedToDate,
  type CurrencyTotal,
} from "../_lib/investorStats";
import { usePortalRows } from "../_lib/usePortalRows";
import { claimableEntitlements } from "@/lib/portal";
import { getHolder } from "@/lib/holder";
import { PayoutCalendar } from "./PayoutCalendar";
import { useClaims } from "../_lib/useClaims";
import { type Locale } from "@/i18n/locale";

function Money({
  totals,
  locale,
}: {
  totals: CurrencyTotal[];
  locale: Locale;
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

type ClaimProps = {
  claimable: number;
  claiming: boolean;
  onClaimAll: () => void;
};

/** Petrol KPI band (plan 15 task 1533): claimable now · next coupon in N days · received to date. */
function PortfolioHeader({
  rows,
  claim,
}: {
  rows: Parameters<typeof faceTotals>[0];
  claim: ClaimProps;
}) {
  const t = useTranslations("investor.portfolio");
  const locale = useLocale() as Locale;
  const next = nextPayment(rows);
  const days = next ? daysUntil(next.date) : undefined;
  const claimable = claimableNow(rows);
  const registered = rows.filter((r) => r.me !== undefined);
  const kyc = registered.some((r) => r.me?.status === "Suspended")
    ? { tone: "danger", label: t("kycSuspended") }
    : registered.length > 0
      ? { tone: "success", label: t("kycOk") }
      : { tone: "neutral", label: t("kycNone") };
  const kpiLabel = "text-sm font-semibold text-p100"; // sentence case (§2); opus #18 dropped the tracked caps
  const kpiValue =
    "num mt-1.5 text-2xl font-extrabold [&_.text-n500]:text-p100";

  return (
    // opus #18: the page h1 already says "Portfolio" — no repeated title, no decorative gradient (§1), card radius
    <section className="rounded-card bg-p900 p-6 text-white sm:p-8">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge tone={kyc.tone}>
          {kyc.label}
          <span className="ml-1 font-normal opacity-80">(SAS · SIMULATED)</span>
        </Badge>
        {claim.claimable > 0 && (
          <Button
            className="w-full sm:w-auto"
            onClick={claim.onClaimAll}
            loading={claim.claiming}
          >
            {t("claimAll")}
          </Button>
        )}
      </div>
      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <div className="min-w-0">
          <div className={kpiLabel}>{t("claimableNow")}</div>
          <div className={kpiValue}>
            <Money totals={claimable} locale={locale} />
          </div>
          {claim.claimable > 0 && (
            <div className="num mt-1 text-sm text-p100">
              {t("claimableCount", { count: claim.claimable })}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={kpiLabel}>{t("nextCoupon")}</div>
          <div className={kpiValue}>
            {days !== undefined ? t("inDays", { count: days }) : "—"}
          </div>
          {next?.est && (
            <div className="num mt-1 text-sm text-p100">
              <Amount
                minor={next.est.minor}
                currency={next.est.currency}
                locale={locale}
              />{" "}
              · {formatDate(next.date, locale)}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={kpiLabel}>{t("receivedToDate")}</div>
          <div className={kpiValue}>
            <Money totals={receivedToDate(rows)} locale={locale} />
          </div>
        </div>
      </div>
    </section>
  );
}

/** The /investor page body inside <InvestorIdentity>. */
export function PortfolioView() {
  const { owner, mode } = useInvestor();
  const t = useTranslations("investor.portfolio");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const { rows, error, reload } = usePortalRows();
  const claims = useClaims(rows ?? [], reload, mode, owner);
  // One holder lookup feeds the payout calendar and the per-position route cards (/holders/{owner}, cached 15 s).
  const [holder, setHolder] = useState<Awaited<
    ReturnType<typeof getHolder>
  > | null>(null);
  useEffect(() => {
    let live = true;
    setHolder(null);
    getHolder(owner)
      .then((h) => live && setHolder(h))
      .catch(() => live && setHolder(null)); // positions/calendar degrade their own cards, never the page
    return () => {
      live = false;
    };
  }, [owner]);

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
        <Skeleton className="h-36 rounded-card" />
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

  // The Claim button lives on the payout rows it pays out (plan 15 task 1533); watch mode is read-only — no button.
  const claimable =
    mode === "watch"
      ? new Set<string>()
      : new Set(claimableEntitlements(rows).map((c) => c.entitlement.pda));

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
      essential: true,
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
      key: "tax",
      header: t("col.tax"),
      align: "right",
      essential: true,
      render: ({ e }) =>
        e.tax ? (
          <Amount
            minor={e.tax.minor}
            currency={e.tax.currency}
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
      render: ({ e, row, action }) =>
        action && claimable.has(e.pda) ? (
          <Button
            size="sm"
            loading={claims.claiming}
            onClick={() =>
              void claims.claim({
                mint: row.series.mint,
                actionPda: action.pda,
              })
            }
          >
            {t("claim")}
          </Button>
        ) : (
          <Badge status={e.status} />
        ),
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
      header: <GlossaryTerm term="recordDate">{t("col.record")}</GlossaryTerm>,
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
      <PortfolioHeader
        rows={rows}
        claim={{
          claimable: claimable.size,
          claiming: claims.claiming,
          onClaimAll: () => void claims.claimAll(),
        }}
      />

      <PayoutCalendar
        upcoming={holder?.upcomingPayouts ?? []}
        loading={holder === null}
      />

      <OpenTrades rows={rows} />

      <section aria-labelledby="holdings" data-tour="holdings">
        <h2 id="holdings" className="mb-3 text-lg font-bold">
          {t("holdings")}
        </h2>
        <HoldingsList
          rows={rows}
          paidTxs={lastTxByMint}
          positions={holder?.positions}
          mode={mode}
        />
      </section>

      <section aria-labelledby="history">
        <h2 id="history" className="mb-3 text-lg font-bold">
          <GlossaryTerm term="entitlement">{t("history")}</GlossaryTerm>
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
