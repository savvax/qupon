"use client";

import { useLocale, useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { bpsToPercent, formatDate, frequencyLabel } from "@/lib/format";
import { estimateCoupon, nextCoupon, type SeriesRow } from "@/lib/portal";

/** One holding card: series, units, coupon, maturity, next-coupon estimate, last payment with its tx. */
function Holding({ row, lastTx }: { row: SeriesRow; lastTx?: string }) {
  const t = useTranslations("investor.portfolio");
  const locale = useLocale() as "en" | "ru"; // next-intl is wired to en|ru only (src/i18n/request.ts)
  const units = row.me?.units ?? "0";
  const next = nextCoupon(row);
  const est = next ? estimateCoupon(row.series, units, next) : undefined;
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
        <Badge status={row.me?.status ?? row.series.status} />
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
    </Card>
  );
}

/** Cards for every series the investor is registered in. */
export function HoldingsList({
  rows,
  paidTxs,
}: {
  rows: SeriesRow[];
  paidTxs: Map<string, string>;
}) {
  const t = useTranslations("investor.portfolio");
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
        />
      ))}
    </div>
  );
}
