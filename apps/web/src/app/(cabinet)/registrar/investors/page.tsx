import { getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { listInvestors, listSeries, type InvestorDTO } from "@/lib/api";
import { bpsToPercent } from "@/lib/format";
import { InvestorRowActions } from "../_components/InvestorRowActions";
import { OnboardDialog } from "../_components/OnboardDialog";
import { SeriesPicker } from "../_components/SeriesPicker";

export default async function RegistrarInvestors({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const t = await getTranslations("registrar.investors");
  const { mint: wanted } = await searchParams;
  const series = (await listSeries().catch(() => null)) ?? [];
  const selected = series.find((s) => s.mint === wanted) ?? series[0];
  const investors = selected
    ? ((await listInvestors(selected.mint).catch(() => [])) as InvestorDTO[])
    : [];

  const columns: Column<InvestorDTO>[] = [
    {
      key: "owner",
      header: t("owner"),
      render: (r) => <Address value={r.owner} />,
    },
    {
      key: "units",
      header: t("units"),
      align: "right",
      render: (r) => <span className="num">{r.units}</span>,
    },
    {
      key: "type",
      header: t("type"),
      hideBelow: "md",
      render: (r) =>
        r.investorType ? t(`types.${r.investorType}`) : t("none"),
    },
    {
      key: "residency",
      header: t("residency"),
      hideBelow: "md",
      render: (r) =>
        r.residency ? t(`residencies.${r.residency}`) : t("none"),
    },
    {
      key: "tax",
      header: t("tax"),
      hideBelow: "md",
      render: (r) =>
        r.taxRateBps != null ? bpsToPercent(r.taxRateBps) : t("none"),
    },
    {
      key: "kyc",
      header: t("kyc"),
      render: (r) =>
        r.kycRef ? (
          <Address value={r.kycRef} />
        ) : (
          <span className="text-n400">{t("none")}</span>
        ),
    },
    {
      key: "status",
      header: t("status"),
      render: (r) => <Badge status={r.status} />,
    },
    {
      key: "actions",
      header: t("actions"),
      align: "right",
      render: (r) => (
        <InvestorRowActions
          mint={selected?.mint ?? ""}
          owner={r.owner}
          status={r.status}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-xl text-sm text-n600">{t("lead")}</p>
        </div>
        <OnboardDialog
          series={series.map((s) => ({ mint: s.mint, ticker: s.ticker }))}
        />
      </header>

      {series.length === 0 ? (
        <EmptyState title={t("noSeries")} body={t("noSeriesBody")} />
      ) : (
        <>
          <SeriesPicker
            mint={selected?.mint ?? ""}
            series={series.map((s) => ({ mint: s.mint, ticker: s.ticker }))}
          />
          <Card>
            <DataTable
              columns={columns}
              rows={investors}
              rowKey={(r) => r.owner}
              empty={t("empty")}
            />
          </Card>
        </>
      )}
    </div>
  );
}
