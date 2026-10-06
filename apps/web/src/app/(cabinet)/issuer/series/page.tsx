import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import type { SeriesDTO } from "@/lib/api";
import { bpsToPercent, formatDate } from "@/lib/format";
import { issuerSeries } from "../_components/data";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("issuerSeries") };
}

export const dynamic = "force-dynamic";

export default async function IssuerSeriesList() {
  const series = await issuerSeries();
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const [t, tb, ts] = await Promise.all([
    getTranslations("issuer"),
    getTranslations("bonds"),
    getTranslations("status"),
  ]);
  // Active first; closed series last.
  const rank = (s: SeriesDTO) =>
    s.status === "Active" ? 0 : s.status === "Closed" ? 2 : 1;
  const rows = [...series].sort(
    (a, b) => rank(a) - rank(b) || a.ticker.localeCompare(b.ticker),
  );
  const cols: Column<SeriesDTO>[] = [
    {
      key: "bond",
      header: tb("colBond"),
      render: (s) => (
        <Link
          href={`/issuer/series/${s.mint}`}
          className="font-bold text-g700 hover:underline"
        >
          {s.ticker}
          <span className="num ml-2 text-xs font-medium text-n500">
            {s.isin}
          </span>
        </Link>
      ),
    },
    {
      key: "face",
      header: tb("colFace"),
      align: "right",
      hideBelow: "md",
      render: (s) => (
        <Amount
          minor={s.faceValue.minor}
          currency={s.faceValue.currency}
          locale={locale}
        />
      ),
    },
    {
      key: "coupon",
      header: tb("colCoupon"),
      align: "right",
      render: (s) => (
        <span className="num">{bpsToPercent(s.couponRateBps, locale)}</span>
      ),
    },
    {
      key: "next",
      header: tb("colNextCoupon"),
      hideBelow: "md",
      render: (s) => (
        <span className="num">{formatDate(s.nextCouponDate, locale)}</span>
      ),
    },
    {
      key: "status",
      header: tb("colStatus"),
      render: (s) => (
        <Badge status={s.status}>
          {ts.has(s.status) ? ts(s.status) : s.status}
        </Badge>
      ),
    },
  ];
  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t("series.title")}
          </h1>
          <p className="mt-1 text-n600">{t("series.lead")}</p>
        </div>
        <Button asChild>
          <Link href="/issuer/series/new">{t("dashboard.newSeries")}</Link>
        </Button>
      </div>
      <div className="mt-6">
        <DataTable
          columns={cols}
          rows={rows}
          rowKey={(s) => s.mint}
          empty={t("series.empty")}
        />
      </div>
    </div>
  );
}
