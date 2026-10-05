import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import { listPublicSeries, type SeriesDTO } from "@/lib/api";
import { bpsToPercent, formatDate } from "@/lib/format";
import type { Locale } from "@/i18n/request";

import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("bonds") };
}
export const dynamic = "force-dynamic";

const FREQ_KEY: Record<number, string> = {
  1: "freqAnnual",
  2: "freqSemiAnnual",
  4: "freqQuarterly",
  12: "freqMonthly",
};

/** Public bond board: active series by default, everything (incl. closed) under "All". */
export default async function BondsPage() {
  const locale = (await getLocale()) as Locale;
  const [t, ts, tf] = await Promise.all([
    getTranslations("bonds"),
    getTranslations("status"),
    getTranslations("bond"),
  ]);
  const series = await listPublicSeries();
  // Closed and matured series only appear under "All".
  const active = series.filter(
    (s) => s.status === "Active" || s.status === "Retiring",
  );
  const freqLabel = (f: number) =>
    FREQ_KEY[f] ? tf(FREQ_KEY[f]!) : `${f}×/yr`;

  const columns: Column<SeriesDTO>[] = [
    {
      key: "bond",
      header: t("colBond"),
      render: (s) => (
        <Link
          href={`/bonds/${s.mint}`}
          className="font-bold text-g700 underline-offset-2 hover:underline after:absolute after:inset-0 after:content-['']"
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
      header: t("colFace"),
      align: "right",
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
      header: t("colCoupon"),
      align: "right",
      render: (s) => (
        <span className="num">{bpsToPercent(s.couponRateBps)}</span>
      ),
    },
    {
      key: "frequency",
      header: t("colFrequency"),
      hideBelow: "md",
      render: (s) => freqLabel(s.frequency),
    },
    {
      key: "next",
      header: t("colNextCoupon"),
      hideBelow: "md",
      render: (s) => (
        <span className="num">{formatDate(s.nextCouponDate)}</span>
      ),
    },
    {
      key: "status",
      header: t("colStatus"),
      render: (s) => <Badge status={s.status}>{ts(s.status)}</Badge>,
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <h1 className="text-[28px] font-bold leading-tight text-n900">
        {t("title")}
      </h1>
      <p className="mt-2 max-w-2xl text-n600">{t("lead")}</p>
      <div className="mt-6">
        <Tabs
          defaultValue="active"
          items={[
            {
              value: "active",
              label: t("filterActive"),
              content: (
                <DataTable
                  columns={columns}
                  rows={active}
                  rowKey={(s) => s.mint}
                  empty={t("emptyActive")}
                />
              ),
            },
            {
              value: "all",
              label: t("filterAll"),
              content: (
                <DataTable
                  columns={columns}
                  rows={series}
                  rowKey={(s) => s.mint}
                  empty={t("emptyActive")}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
