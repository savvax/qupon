import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { listSeries } from "@/lib/api";
import { bpsToPercent } from "@/lib/format";
import { csvHref, getHolders, printHref, type HoldingRow } from "@/lib/reports";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("reports.registrar");
  return { title: `${t("title")} · Qupon` };
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Holder register per series (platform v2 §5.4): /registrar/reports/holders/{mint}. */
export default async function RegistrarReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const sp = await searchParams;
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const t = await getTranslations("reports.registrar");
  const tc = await getTranslations("reports.cols");

  const series = (await listSeries().catch(() => null)) ?? [];
  const selected = series.find((s) => s.mint === sp.mint) ?? series[0];
  const holders = selected
    ? await getHolders(selected.mint).catch(() => null)
    : null;

  const columns: Column<HoldingRow>[] = [
    {
      key: "owner",
      header: tc("owner"),
      render: (h) => <Address value={h.owner} />,
    },
    {
      key: "units",
      header: tc("units"),
      align: "right",
      render: (h) => (
        <span className="num">{h.units.toLocaleString("en-US")}</span>
      ),
    },
    {
      key: "investorType",
      header: tc("investorType"),
      hideBelow: "md",
      render: (h) => <span className="num text-sm">{h.investorType}</span>,
    },
    {
      key: "residency",
      header: tc("residency"),
      hideBelow: "md",
      render: (h) => <span className="num text-sm">{h.residency}</span>,
    },
    {
      key: "taxBps",
      header: tc("taxBps"),
      align: "right",
      hideBelow: "lg",
      render: (h) => (
        <span className="num">{bpsToPercent(h.taxBps, locale)}</span>
      ),
    },
    {
      key: "status",
      header: tc("status"),
      render: (h) => <Badge status={h.status}>{h.status}</Badge>,
    },
    {
      key: "kycRef",
      header: tc("kycRef"),
      hideBelow: "lg",
      render: (h) =>
        BASE58.test(h.kycRef) ? (
          <Address value={h.kycRef} />
        ) : (
          <span className="num text-sm">{h.kycRef}</span>
        ),
    },
  ];

  const inputCx =
    "rounded-btn border border-n300 bg-n0 px-3 py-2 text-sm text-n900 focus:border-g600 focus:outline-none";

  return (
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
      </header>

      {!selected ? (
        <Card padding="lg">{t("empty")}</Card>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            {/* Plain GET form: server-rendered series pick, no client JS. */}
            <form
              method="get"
              action="/registrar/reports"
              className="flex flex-wrap items-end gap-3"
            >
              <label className="text-sm font-semibold text-n800">
                {t("series")}
                <select
                  name="mint"
                  defaultValue={selected?.mint}
                  className={`mt-1 block w-52 ${inputCx}`}
                >
                  {series.map((s) => (
                    <option key={s.mint} value={s.mint}>
                      {s.ticker}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit" size="sm">
                {t("apply")}
              </Button>
            </form>
            <div className="flex gap-2">
              <Button asChild variant="secondary" size="sm">
                <a
                  href={csvHref(
                    `registrar/reports/holders/${selected.mint}`,
                    {},
                  )}
                >
                  {t("csv")}
                </a>
              </Button>
              <Button asChild variant="secondary" size="sm">
                <a href={printHref("holders", { mint: selected.mint })}>
                  {t("print")}
                </a>
              </Button>
            </div>
          </div>

          {holders ? (
            <DataTable
              columns={columns}
              rows={holders.holders}
              rowKey={(h) => h.owner}
              empty={t("empty")}
            />
          ) : (
            <Card padding="lg">{t("empty")}</Card>
          )}
        </>
      )}
    </div>
  );
}
