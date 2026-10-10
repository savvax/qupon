"use client";

/**
 * Holdings cards (plan 15 task 1533): the position with clean, accrued and dirty value and YTM (last traded price,
 * or par when the series never traded), default/cure badges from the series' credit state, and the payout route card.
 */
import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { bpsToPercent, formatDate, frequencyLabel } from "@/lib/format";
import { type SeriesRow, nextCoupon, estimateCoupon } from "@/lib/portal";
import { positionValuation } from "@/lib/position";
import { listTrades } from "@/lib/trades";
import { type HolderPosition } from "@/lib/holder";
import { type Locale } from "@/i18n/locale";
import { PayoutRouteCard } from "./PayoutRouteCard";

/** Last traded clean price per unit (minor units), per mint — undefined while loading, face when never traded. */
function usePrices(rows: SeriesRow[]): Map<string, bigint> {
  const [prices, setPrices] = useState<Map<string, bigint>>(new Map());
  useEffect(() => {
    let live = true;
    const mints = rows
      .filter((r) => r.me !== undefined)
      .map((r) => r.series.mint);
    if (mints.length === 0) return;
    Promise.all(
      mints.map((mint) =>
        listTrades(mint)
          .then((t) => [mint, t] as const)
          .catch(() => [mint, undefined] as const),
      ),
    ).then((entries) => {
      if (!live) return;
      const out = new Map<string, bigint>();
      for (const [mint, trades] of entries) {
        const last =
          trades && trades.items.length > 0
            ? trades.items[trades.items.length - 1]
            : undefined;
        if (!last) continue;
        // The last admitted trade's cash per bond unit is the market's last word on the clean price.
        out.set(mint, BigInt(last.cashAmount.minor) / BigInt(last.units));
      }
      setPrices(out);
    });
    return () => {
      live = false;
    };
  }, [rows]);
  return prices;
}

/** Credit badges of one series: in default now, cured before, or the count when it defaulted more than once. */
function CreditBadges({ row }: { row: SeriesRow }) {
  const t = useTranslations("status");
  if (!row.series.inDefault && !row.series.defaultsCount) return null;
  return (
    <span className="flex gap-1">
      {row.series.inDefault && (
        <span className="inline-flex h-6 items-center rounded-full bg-default px-2.5 text-xs font-bold text-white">
          {t("Defaulted")}
        </span>
      )}
      {!row.series.inDefault && row.series.defaultsCount ? (
        <span className="inline-flex h-6 items-center rounded-full border border-cure-bd bg-cure-bg px-2.5 text-xs font-bold text-cure-fg">
          {t("Cured")}
          {row.series.defaultsCount > 1 ? ` ×${row.series.defaultsCount}` : ""}
        </span>
      ) : null}
    </span>
  );
}

/** One holding card: series, units, valuation (clean/accrued/dirty + YTM), next coupon, last payment, route. */
function Holding({
  row,
  lastTx,
  position,
  mode,
  price,
}: {
  row: SeriesRow;
  lastTx?: string;
  position?: HolderPosition;
  mode: "wallet" | "demo" | "watch";
  price?: bigint;
}) {
  const t = useTranslations("investor.portfolio");
  const locale = useLocale() as Locale;
  const units = row.me?.units ?? "0";
  const next = nextCoupon(row);
  const est = next ? estimateCoupon(row.series, units, next) : undefined;
  const val = positionValuation({
    series: row.series,
    units,
    cleanPrice: price,
  });
  const cured = row.actions.some((a) => a.curedAt != null);
  const paid = [...row.entitlements]
    .filter((e) => e.status === "Paid")
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))[0];
  const dl = "mt-1 flex items-baseline justify-between gap-3 text-sm";
  const k = "text-xs font-semibold text-n500";

  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-extrabold">{row.series.ticker}</div>
          <div className="text-xs text-n500">
            {row.series.isin} · <Address value={row.series.mint} />
          </div>
        </div>
        <span className="flex flex-wrap justify-end gap-1">
          <Badge status={row.me?.status ?? row.series.status} />
          <CreditBadges row={row} />
          {cured && <Badge tone="success">{t("cured")}</Badge>}
        </span>
      </div>
      <dl className="mt-4">
        <div className={dl}>
          <dt className={k}>{t("units")}</dt>
          <dd className="num font-semibold">{units}</dd>
        </div>
        <div className={dl}>
          <dt className={k}>{t("coupon")}</dt>
          <dd>
            {bpsToPercent(row.series.couponRateBps, locale)} ·{" "}
            {frequencyLabel(row.series.frequency, locale)}
          </dd>
        </div>
        <div className={dl}>
          <dt className={k}>{t("maturity")}</dt>
          <dd className="num">{formatDate(row.series.maturityDate, locale)}</dd>
        </div>
        {val && (
          <div className={dl}>
            <dt className={k}>{t("valuation")}</dt>
            <dd className="text-right">
              <span className="num">
                {t("dirtyValue")}{" "}
                <Amount
                  minor={val.dirty}
                  currency={row.series.faceValue.currency}
                  locale={locale}
                />
              </span>
              <div className="num text-xs text-n500">
                {t("cleanValue")}{" "}
                <Amount
                  minor={val.clean}
                  currency={row.series.faceValue.currency}
                  locale={locale}
                />{" "}
                · {t("accruedValue")}{" "}
                <Amount
                  minor={val.accrued}
                  currency={row.series.faceValue.currency}
                  locale={locale}
                />
              </div>
              {val.ytm !== undefined && (
                <div className="num text-xs text-n600">
                  {t("ytm")} {bpsToPercent(Math.round(val.ytm * 10000), locale)}
                  {price === undefined ? ` · ${t("atPar")}` : ""}
                </div>
              )}
            </dd>
          </div>
        )}
        <div className={dl}>
          <dt className={k}>{t("nextEstimate")}</dt>
          <dd className="text-right">
            {est !== undefined ? (
              <Amount
                minor={est}
                currency={row.series.faceValue.currency}
                locale={locale}
              />
            ) : (
              "—"
            )}
            {next && (
              <div className="num text-xs text-n500">
                {formatDate(next.paymentDate, locale)}
              </div>
            )}
          </dd>
        </div>
        <div className={dl}>
          <dt className={k}>{t("lastPayment")}</dt>
          <dd className="text-right">
            {paid?.net ? (
              <>
                <Amount
                  minor={paid.net.minor}
                  currency={paid.net.currency}
                  locale={locale}
                />
                <div className="text-xs text-n500">
                  {formatDate(paid.paidAt ?? "", locale)}
                  {lastTx && (
                    <>
                      {" · "}
                      <Address value={lastTx} kind="tx" />
                    </>
                  )}
                </div>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>
      {position && (
        <div className="mt-3">
          <PayoutRouteCard position={position} mode={mode} />
        </div>
      )}
    </Card>
  );
}

/** Cards for every series the investor is registered in. */
export function HoldingsList({
  rows,
  paidTxs,
  positions,
  mode,
}: {
  rows: SeriesRow[];
  paidTxs: Map<string, string>;
  /** /holders/{owner} positions: carry the payout route shown on the card. */
  positions?: HolderPosition[];
  mode: "wallet" | "demo" | "watch";
}) {
  const t = useTranslations("investor.portfolio");
  const prices = usePrices(rows);
  const byMint = new Map((positions ?? []).map((p) => [p.mint, p]));
  const holdings = rows.filter((r) => r.me !== undefined);
  if (holdings.length === 0) {
    return (
      <EmptyState title={t("holdingsEmpty")} body={t("holdingsEmptyBody")} />
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {holdings.map((row) => (
        <Holding
          key={row.series.mint}
          row={row}
          lastTx={paidTxs.get(row.series.mint)}
          position={byMint.get(row.series.mint)}
          mode={mode}
          price={prices.get(row.series.mint)}
        />
      ))}
    </div>
  );
}
