import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import {
  listActions,
  listInvestors,
  listSeries,
  type ActionDTO,
  type SeriesDTO,
} from "@/lib/api";
import { formatDate } from "@/lib/format";
import { metaTitle } from "@/lib/meta";
import { Alerts, Pipeline, deriveAlerts } from "./_components/Pipeline";

const OPEN = new Set([
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "Retiring",
  "VotingOpen",
]);

export async function generateMetadata() {
  return { title: await metaTitle("registrar") };
}

export default async function RegistrarDashboard() {
  const t = await getTranslations("registrar.dash");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const month = formatDate(new Date().toISOString()).slice(0, 7);
  // Reads are public read models; the page renders its shell even when the API is down.
  const series = await listSeries().catch(() => null);
  let actions: ActionDTO[] = [];
  const counts = { series: 0, investors: 0 };
  const monthly = new Map<string, bigint>();
  if (series) {
    counts.series = series.filter((s) => s.status === "Active").length;
    const [perSeries, investorsPerSeries] = await Promise.all([
      Promise.all(series.map((s) => listActions(s.mint).catch(() => []))),
      Promise.all(series.map((s) => listInvestors(s.mint).catch(() => []))),
    ]);
    actions = perSeries.flat();
    for (const list of investorsPerSeries) counts.investors += list.length;
    for (const a of actions) {
      if (
        a.completedAt &&
        formatDate(a.completedAt).slice(0, 7) === month &&
        a.totalPaid
      ) {
        const cur = a.totalPaid.currency;
        monthly.set(cur, (monthly.get(cur) ?? 0n) + BigInt(a.totalPaid.minor));
      }
    }
  }
  // Largest currency first when several cash legs paid this month.
  const payout = [...monthly.entries()].sort((a, b) => Number(b[1] - a[1]))[0];
  const emptySeries: SeriesDTO[] = [];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      </header>

      {series === null ? (
        <EmptyState title={t("unavailable")} body={t("unavailableBody")} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label={t("activeSeries")} value={counts.series} />
            <Kpi
              label={t("openActions")}
              value={actions.filter((a) => OPEN.has(a.status)).length}
            />
            <Kpi label={t("investors")} value={counts.investors} />
            <Kpi
              label={t("payoutsThisMonth")}
              value={
                payout ? (
                  <Amount
                    minor={payout[1]}
                    currency={payout[0]}
                    locale={locale}
                  />
                ) : (
                  <Amount minor={0n} currency="tKZT" locale={locale} />
                )
              }
            />
          </div>

          <Pipeline actions={actions} series={series ?? emptySeries} />

          <Card>
            <h2 className="text-base font-bold">{t("alerts")}</h2>
            <div className="mt-3">
              <Alerts alerts={deriveAlerts(actions)} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
