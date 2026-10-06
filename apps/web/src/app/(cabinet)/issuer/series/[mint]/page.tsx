import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Kpi } from "@/components/ui/Kpi";
import { Tabs } from "@/components/ui/Tabs";
import {
  getSchedule,
  getSeries,
  listActions,
  listInvestors,
  type ActionDTO,
  type InvestorDTO,
  type ScheduleItem,
} from "@/lib/api";
import { bpsToPercent, formatDate } from "@/lib/format";
import { printHref } from "@/lib/reports";
import { KIND_TONE } from "@/lib/ui/badge";
import {
  AnnounceButton,
  FundButton,
  MeetingButton,
} from "../../_components/IssuerActions";
import { metaTitle } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await metaTitle("issuerSeries") };
}

const OPEN = [
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "VotingOpen",
  "Retiring",
];

export default async function IssuerSeriesPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const series = await getSeries(mint).catch((e: unknown) => {
    const status = (e as { status?: number } | null)?.status;
    if (status === 404 || status === 400) notFound();
    throw e;
  });
  const [schedule, actions, investors] = await Promise.all([
    getSchedule(mint).catch(() => [] as ScheduleItem[]),
    listActions(mint).catch(() => [] as ActionDTO[]),
    listInvestors(mint).catch(() => [] as InvestorDTO[]),
  ]);
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const [t, tb, ts, tk, tr] = await Promise.all([
    getTranslations("issuer"),
    getTranslations("bond"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
    getTranslations("reports.issuer"),
  ]);
  const status = (s: string) => (
    <Badge status={s}>{ts.has(s) ? ts(s) : s}</Badge>
  );
  const money = (a?: { minor: string; currency: string } | null) =>
    a ? <Amount minor={a.minor} currency={a.currency} locale={locale} /> : "—";
  const open = actions.find((a) => OPEN.includes(a.status));

  const scheduleCols: Column<ScheduleItem>[] = [
    {
      key: "n",
      header: "#",
      render: (r) => <span className="num">{r.couponNumber}</span>,
    },
    {
      key: "record",
      header: tb("cols.record"),
      render: (r) => (
        <span className="num">{formatDate(r.recordDate, locale)}</span>
      ),
    },
    {
      key: "payment",
      header: tb("cols.payment"),
      hideBelow: "md",
      render: (r) => (
        <span className="num">{formatDate(r.paymentDate, locale)}</span>
      ),
    },
    {
      key: "perUnit",
      header: tb("cols.perUnit"),
      align: "right",
      render: (r) => money(r.amountPerUnit),
    },
    {
      key: "total",
      header: t("detail.total"),
      align: "right",
      hideBelow: "md",
      render: (r) => money(r.totalAmount),
    },
    {
      key: "status",
      header: tb("cols.status"),
      render: (r) => status(r.status),
    },
  ];
  const actionCols: Column<ActionDTO>[] = [
    {
      key: "action",
      header: tb("cols.action"),
      // a link like every other action list: the bond page's actions tab (registrar pages are registrar-only)
      render: (a) => (
        <Link
          href={`/bonds/${a.seriesMint}?tab=actions`}
          className="group block"
        >
          <span className="font-semibold text-g700 underline decoration-g300 underline-offset-2 group-hover:decoration-g600">
            {tk.has(a.kind) ? tk(a.kind) : a.kind}
          </span>
          <span className="num mt-0.5 block text-xs text-n500">{a.corpId}</span>
        </Link>
      ),
    },
    {
      key: "kind",
      header: t("dashboard.kind"),
      hideBelow: "md",
      render: (a) => (
        <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind}</Badge>
      ),
    },
    {
      key: "payment",
      header: tb("cols.payment"),
      render: (a) => (
        <span className="num">{formatDate(a.paymentAt, locale)}</span>
      ),
    },
    {
      key: "status",
      header: tb("cols.status"),
      render: (a) => status(a.status),
    },
    {
      key: "do",
      header: "",
      align: "right",
      render: (a) => (
        <div className="flex justify-end gap-2">
          {a.status === "SnapshotComplete" && <FundButton pda={a.pda} />}
          <Button asChild variant="secondary" size="sm">
            <Link href={printHref("payouts", { pda: a.pda })}>
              {tr("payoutReport")}
            </Link>
          </Button>
        </div>
      ),
    },
  ];
  const holderCols: Column<InvestorDTO>[] = [
    {
      key: "owner",
      header: t("detail.holder"),
      render: (i) => <Address value={i.owner} />,
    },
    {
      key: "units",
      header: t("detail.units"),
      align: "right",
      render: (i) => <span className="num">{i.units}</span>,
    },
    {
      key: "status",
      header: tb("cols.status"),
      render: (i) => status(i.status),
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <Link
        href="/issuer/series"
        className="text-sm font-semibold text-g700 hover:underline"
      >
        ← {t("series.title")}
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {series.ticker}
            </h1>
            {status(series.status)}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-n600">
            <span className="num">{series.isin}</span>
            <Address value={series.mint} />
          </div>
        </div>
        {series.status === "Active" && !open && (
          <div className="flex flex-wrap gap-2">
            <AnnounceButton mint={series.mint} />
            <MeetingButton
              mint={series.mint}
              currentRateBps={series.couponRateBps}
            />
          </div>
        )}
      </div>
      {open && (
        <p className="mt-4 rounded-btn bg-p50 px-4 py-3 text-sm text-p700">
          {t("detail.openAction", {
            kind: tk.has(open.kind) ? tk(open.kind) : open.kind,
            status: ts.has(open.status) ? ts(open.status) : open.status,
          })}
        </p>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi label={tb("kpi.face")} value={money(series.faceValue)} />
        <Kpi
          label={tb("kpi.coupon")}
          value={
            <span className="num">
              {bpsToPercent(series.couponRateBps, locale)}
            </span>
          }
        />
        <Kpi
          label={tb("kpi.next")}
          value={
            <span className="num">
              {formatDate(series.nextCouponDate, locale)}
            </span>
          }
        />
        <Kpi
          label={t("detail.holders")}
          value={<span className="num">{investors.length}</span>}
          hint={t("detail.issued", { units: series.totalIssued })}
        />
      </div>

      <div className="mt-8">
        <Tabs
          defaultValue="actions"
          items={[
            {
              value: "actions",
              label: tb("tabs.actions"),
              content: (
                <DataTable
                  columns={actionCols}
                  rows={actions}
                  rowKey={(a) => a.pda}
                  empty={tb("emptyActions")}
                />
              ),
            },
            {
              value: "schedule",
              label: tb("tabs.schedule"),
              content: (
                <DataTable
                  columns={scheduleCols}
                  rows={schedule}
                  rowKey={(r) => String(r.couponNumber)}
                  empty={tb("emptySchedule")}
                />
              ),
            },
            {
              value: "holders",
              label: t("detail.holdersTab"),
              content: (
                <DataTable
                  columns={holderCols}
                  rows={investors}
                  rowKey={(i) => i.owner}
                  empty={t("detail.noHolders")}
                />
              ),
            },
          ]}
        />
      </div>
    </div>
  );
}
