import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Kpi } from "@/components/ui/Kpi";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { Tabs } from "@/components/ui/Tabs";
import {
  getSchedule,
  getSeries,
  listActions,
  listSeriesDocuments,
  seriesDocumentUrl,
  type ActionDTO,
  type ScheduleItem,
} from "@/lib/api";
import { bpsToPercent, formatDate } from "@/lib/format";
import { getKaseSeriesTicker } from "@/lib/kase";
import { KasePanel } from "./KasePanel";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const t = await getTranslations("meta");
  const s = await getSeries(mint).catch(() => null);
  return {
    title: s ? t("bond", { ticker: s.ticker, isin: s.isin }) : t("bonds"),
  };
}

const FREQ_KEY: Record<number, string> = {
  1: "freqAnnual",
  2: "freqSemiAnnual",
  4: "freqQuarterly",
  12: "freqMonthly",
};
const DAY_COUNT: Record<string, string> = {
  THIRTY_360: "30E/360",
  ACT_365: "ACT/365",
  ACT_ACT: "ACT/ACT",
};

export default async function BondPage({
  params,
  searchParams,
}: {
  params: Promise<{ mint: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { mint } = await params;
  // ?tab=actions|terms opens that tab (links from the issuer cabinet)
  const { tab } = await searchParams;
  const series = await getSeries(mint).catch((e: unknown) => {
    // Unknown or malformed mint → 404 (ApiError in production, Api404 in mock mode: both carry .status).
    const status = (e as { status?: number } | null)?.status;
    if (status === 404 || status === 400) notFound();
    throw e;
  });
  const [schedule, actions, documents] = await Promise.all([
    getSchedule(mint).catch(() => [] as ScheduleItem[]),
    listActions(mint).catch(() => [] as ActionDTO[]),
    listSeriesDocuments(mint),
  ]);
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  // Series linked in series_settings to a KASE ticker get the market panel; failures never block the page.
  const kaseTicker = await getKaseSeriesTicker(mint);
  const [t, ts, tk, tDoc] = await Promise.all([
    getTranslations("bond"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
    getTranslations("org.publicDocs"),
  ]);
  const freq = FREQ_KEY[series.frequency]
    ? t(FREQ_KEY[series.frequency]!)
    : `${series.frequency}×`;
  const money = (a?: { minor: string; currency: string } | null) =>
    a ? <Amount minor={a.minor} currency={a.currency} locale={locale} /> : "—";
  const status = (s: string) => (
    <Badge status={s}>{ts.has(s) ? ts(s) : s}</Badge>
  );

  const scheduleCols: Column<ScheduleItem>[] = [
    {
      key: "n",
      header: "#",
      render: (r) => <span className="num">{r.couponNumber}</span>,
    },
    {
      key: "period",
      header: t("cols.period"),
      hideBelow: "md",
      render: (r) =>
        r.periodStart && r.periodEnd ? (
          <span className="num">
            {formatDate(r.periodStart, locale)} –{" "}
            {formatDate(r.periodEnd, locale)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "record",
      header: t("cols.record"),
      render: (r) => (
        <span className="num">{formatDate(r.recordDate, locale)}</span>
      ),
    },
    {
      key: "payment",
      header: t("cols.payment"),
      render: (r) => (
        <span className="num">{formatDate(r.paymentDate, locale)}</span>
      ),
    },
    {
      key: "perUnit",
      header: t("cols.perUnit"),
      align: "right",
      render: (r) => money(r.amountPerUnit),
    },
    {
      key: "status",
      header: t("cols.status"),
      render: (r) => status(r.status),
    },
  ];

  const actionCols: Column<ActionDTO>[] = [
    {
      key: "id",
      header: t("cols.action"),
      render: (a) => (
        <span>
          <span className="num font-semibold text-n900">{a.corpId}</span>
          <span className="mt-0.5 block text-xs text-n500">
            {a.kind} · {tk.has(a.kind) ? tk(a.kind) : a.kind}
          </span>
        </span>
      ),
    },
    {
      key: "record",
      header: t("cols.record"),
      hideBelow: "md",
      render: (a) => (
        <span className="num">{formatDate(a.recordAt, locale)}</span>
      ),
    },
    {
      key: "payment",
      header: t("cols.payment"),
      render: (a) => (
        <span className="num">{formatDate(a.paymentAt, locale)}</span>
      ),
    },
    {
      key: "perUnit",
      header: t("cols.perUnit"),
      align: "right",
      render: (a) => (a.kind === "BMET" ? "—" : money(a.perUnitGross)),
    },
    {
      key: "status",
      header: t("cols.status"),
      render: (a) => status(a.status),
    },
    {
      key: "account",
      header: t("cols.account"),
      hideBelow: "lg",
      render: (a) => <Address value={a.pda} />,
    },
  ];

  const terms: [string, React.ReactNode][] = [
    [
      t("terms.isin"),
      <span key="isin" className="num">
        {series.isin}
      </span>,
    ],
    [t("terms.mint"), <Address key="mint" value={series.mint} />],
    [
      t("terms.cash"),
      <Address
        key="cash"
        value={series.cashMint}
        label={series.faceValue.currency}
      />,
    ],
    [t("terms.face"), money(series.faceValue)],
    [
      t("terms.rate"),
      <span key="rate" className="num">
        {bpsToPercent(series.couponRateBps, locale)}
      </span>,
    ],
    [t("terms.frequency"), freq],
    [t("terms.dayCount"), DAY_COUNT[series.dayCount] ?? series.dayCount],
    [
      t("terms.issue"),
      <span key="issue" className="num">
        {formatDate(series.issueDate, locale)}
      </span>,
    ],
    [
      t("terms.maturity"),
      <span key="mat" className="num">
        {formatDate(series.maturityDate, locale)}
      </span>,
    ],
    [
      t("terms.quorum"),
      <span key="q" className="num">
        {bpsToPercent(series.quorumBps, locale)}
      </span>,
    ],
    [
      t("terms.approval"),
      <span key="a" className="num">
        {bpsToPercent(series.approvalBps, locale)}
      </span>,
    ],
    ...(series.issuer
      ? [
          [t("terms.issuer"), <Address key="iss" value={series.issuer} />] as [
            string,
            React.ReactNode,
          ],
        ]
      : []),
    ...(series.registrar
      ? [
          [
            t("terms.registrar"),
            <Address key="reg" value={series.registrar} />,
          ] as [string, React.ReactNode],
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-12">
      <Link
        href="/bonds"
        className="text-sm font-semibold text-g700 hover:underline"
      >
        ← {t("back")}
      </Link>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <h1 className="text-[28px] leading-tight font-extrabold tracking-tight">
          {series.ticker}
        </h1>
        {status(series.status)}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-n600">
        <span className="num">{series.isin}</span>
        <Address value={series.mint} />
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StaggerItem className="min-w-0">
          <Kpi label={t("kpi.face")} value={money(series.faceValue)} />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            label={t("kpi.coupon")}
            value={
              <span className="num">
                {bpsToPercent(series.couponRateBps, locale)}
              </span>
            }
            hint={freq}
          />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            label={t("kpi.next")}
            value={
              <span className="num">
                {formatDate(series.nextCouponDate, locale)}
              </span>
            }
          />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            label={t("kpi.issued")}
            value={
              <span className="num">
                {Number(series.totalIssued).toLocaleString(
                  locale === "ru" ? "ru-RU" : "en-US",
                )}
              </span>
            }
          />
        </StaggerItem>
      </Stagger>
      {kaseTicker && (
        <div className="mt-6">
          <KasePanel ticker={kaseTicker} locale={locale} />
        </div>
      )}

      {documents.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-bold">{tDoc("title")}</h2>
          <ul className="mt-3 divide-y divide-n100 rounded-card border border-n200 bg-n0">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-n900">{d.filename}</span>
                  <span className="ml-2 text-xs text-n500">
                    {d.kind} · {(d.size / 1024).toFixed(0)} KB
                  </span>
                </span>
                <a
                  href={seriesDocumentUrl(d.id)}
                  className="font-semibold text-g700 underline"
                  download
                >
                  {tDoc("download")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-8">
        <Tabs
          defaultValue={tab === "actions" || tab === "terms" ? tab : "schedule"}
          items={[
            {
              value: "schedule",
              label: t("tabs.schedule"),
              content: (
                <DataTable
                  columns={scheduleCols}
                  rows={schedule}
                  rowKey={(r) => String(r.couponNumber)}
                  empty={t("emptySchedule")}
                />
              ),
            },
            {
              value: "actions",
              label: t("tabs.actions"),
              content: (
                <DataTable
                  columns={actionCols}
                  rows={actions}
                  rowKey={(a) => a.pda}
                  empty={t("emptyActions")}
                />
              ),
            },
            {
              value: "terms",
              label: t("tabs.terms"),
              content: (
                <dl className="grid rounded-card border border-n200 bg-n0 sm:grid-cols-2">
                  {terms.map(([k, v], i) => (
                    <div
                      key={k}
                      className={`flex flex-col gap-1 p-4 sm:px-6 ${i > 0 ? "border-t border-n200" : ""} ${i === 1 ? "sm:border-t-0" : ""} sm:odd:border-r`}
                    >
                      <dt className="text-xs font-semibold text-n500">{k}</dt>
                      <dd className="text-sm text-n900">{v}</dd>
                    </div>
                  ))}
                </dl>
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
