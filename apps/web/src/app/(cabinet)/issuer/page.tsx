import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { formatDate } from "@/lib/format";
import { KIND_TONE } from "@/lib/ui/badge";
import { getSession } from "@/lib/session";
import { FundButton } from "./_components/IssuerActions";
import {
  escrowShortfall,
  issuerActions,
  issuerSeries,
  type ActionRow,
} from "./_components/data";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("issuer") };
}

export const dynamic = "force-dynamic";

export default async function IssuerDashboard() {
  const [user, series] = await Promise.all([getSession(), issuerSeries()]);
  const actions = await issuerActions(series);
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const [t, ts, tk] = await Promise.all([
    getTranslations("issuer"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
  ]);

  const active = series.filter((s) => s.status === "Active");
  const next = [...active].sort((a, b) =>
    a.nextCouponDate.localeCompare(b.nextCouponDate),
  )[0];
  const toFund = actions.filter((r) => r.a.status === "SnapshotComplete");
  const shortfall = toFund.reduce((acc, r) => acc + escrowShortfall(r.a), 0n);
  const shortfallCurrency = toFund[0]?.a.perUnitGross.currency ?? "tKZT";
  const approvedMeetings = actions.filter(
    (r) =>
      r.a.kind === "BMET" &&
      r.a.status === "Finalized" &&
      r.a.result === "Approved",
  );

  const cols: Column<ActionRow>[] = [
    {
      key: "action",
      header: t("dashboard.action"),
      render: ({ a, s }) => (
        <Link href={`/issuer/series/${s.mint}`} className="group block">
          <span className="font-bold text-g700 group-hover:underline">
            {tk.has(a.kind) ? tk(a.kind) : a.kind} · {s.ticker}
          </span>
          <span className="num mt-0.5 block text-xs text-n500">{a.corpId}</span>
        </Link>
      ),
    },
    {
      key: "kind",
      header: t("dashboard.kind"),
      hideBelow: "md",
      render: ({ a }) => (
        <Badge tone={KIND_TONE[a.kind] ?? "neutral"}>{a.kind}</Badge>
      ),
    },
    {
      key: "payment",
      header: t("dashboard.payment"),
      render: ({ a }) => <span className="num">{formatDate(a.paymentAt)}</span>,
    },
    {
      key: "status",
      header: t("dashboard.status"),
      render: ({ a }) => (
        <Badge status={a.status}>
          {ts.has(a.status) ? ts(a.status) : a.status}
        </Badge>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1200px]">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {user
              ? t("dashboard.hello", { name: user.name })
              : t("dashboard.title")}
          </h1>
          <p className="mt-1 text-n600">{t("dashboard.lead")}</p>
        </div>
        <Button asChild>
          <Link href="/issuer/series/new">{t("dashboard.newSeries")}</Link>
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Kpi
          label={t("dashboard.kpiSeries")}
          value={<span className="num">{active.length}</span>}
          hint={t("dashboard.kpiSeriesHint", { total: series.length })}
        />
        <Kpi
          label={t("dashboard.kpiNext")}
          value={
            next ? (
              <span className="num">{formatDate(next.nextCouponDate)}</span>
            ) : (
              "—"
            )
          }
          hint={next?.ticker}
        />
        <Kpi
          label={t("dashboard.kpiFund")}
          value={
            toFund.length ? (
              <Amount
                minor={shortfall}
                currency={shortfallCurrency}
                locale={locale}
              />
            ) : (
              "—"
            )
          }
          hint={t("dashboard.kpiFundHint", { count: toFund.length })}
        />
        <Kpi
          label={t("dashboard.kpiActions")}
          value={<span className="num">{actions.length}</span>}
        />
      </div>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("dashboard.todo")}</h2>
        {toFund.length === 0 && approvedMeetings.length === 0 ? (
          <EmptyState
            title={t("dashboard.todoEmpty")}
            body={t("dashboard.todoEmptyBody")}
          />
        ) : (
          <ul className="space-y-3">
            {toFund.map(({ a, s }) => (
              <li
                key={a.pda}
                className="flex flex-col gap-3 rounded-card border border-warn-bd bg-n0 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="font-bold">
                    {t("dashboard.fundTitle", {
                      kind: tk.has(a.kind) ? tk(a.kind) : a.kind,
                      ticker: s.ticker,
                    })}
                  </div>
                  <div className="mt-0.5 text-sm text-n600">
                    {t("dashboard.fundBody", { date: formatDate(a.paymentAt) })}{" "}
                    {escrowShortfall(a) > 0n && (
                      <Amount
                        minor={escrowShortfall(a)}
                        currency={a.perUnitGross.currency}
                        locale={locale}
                      />
                    )}
                  </div>
                </div>
                <FundButton pda={a.pda} size="md" />
              </li>
            ))}
            {approvedMeetings.map(({ a, s }) => (
              <li
                key={a.pda}
                className="rounded-card border border-n200 bg-n0 p-4"
              >
                <div className="font-bold">
                  {t("dashboard.meetingApproved", { ticker: s.ticker })}
                </div>
                <div className="mt-0.5 text-sm text-n600">
                  {t("dashboard.meetingApprovedBody")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">{t("dashboard.latest")}</h2>
        <DataTable
          columns={cols}
          rows={actions.slice(0, 8)}
          rowKey={(r) => r.a.pda}
          empty={t("dashboard.noActions")}
        />
      </section>
    </div>
  );
}
