import { getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { boFetch } from "@/lib/bo";
import { metaTitle } from "@/lib/meta";
import { SeriesRowControls, type OrgOption } from "./SeriesRowControls";

type AdminSeriesRow = {
  mint: string;
  pda?: string;
  ticker?: string;
  isin?: string;
  hidden: boolean;
  featured: boolean;
  kaseTicker: string;
  orgId: number | null;
  updatedAt: number;
};

export async function generateMetadata() {
  return { title: await metaTitle("adminSeries") };
}

/** Admin series settings (platform v2 §5.2): visibility, featuring, KASE ticker, organisation. */
export default async function AdminSeriesPage() {
  const t = await getTranslations("admin.series");
  let series: AdminSeriesRow[] = [];
  let orgs: OrgOption[] = [];
  let down = false;
  try {
    const [s, o] = await Promise.all([
      boFetch<{ series: AdminSeriesRow[] }>("/admin/series"),
      boFetch<{ organizations: OrgOption[] }>("/admin/organizations"),
    ]);
    series = s.series ?? [];
    orgs = o.organizations ?? [];
  } catch {
    down = true; // the layout already gates the role; show a notice
  }

  const columns: Column<AdminSeriesRow>[] = [
    {
      key: "ticker",
      header: t("colTicker"),
      render: (r) => <span className="font-semibold">{r.ticker || "—"}</span>,
    },
    {
      key: "mint",
      header: t("colMint"),
      render: (r) => <Address value={r.mint} />,
    },
    {
      key: "isin",
      header: t("colIsin"),
      hideBelow: "md",
      render: (r) => <span className="num">{r.isin || "—"}</span>,
    },
    {
      key: "settings",
      header: t("colSettings"),
      render: (r) => (
        <SeriesRowControls
          mint={r.mint}
          hidden={r.hidden}
          featured={r.featured}
          kaseTicker={r.kaseTicker}
          orgId={r.orgId}
          orgs={orgs}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
      </header>
      {down ? (
        <EmptyState title={t("unreachable")} body={t("unreachableBody")} />
      ) : series.length === 0 ? (
        <EmptyState title={t("empty")} body={t("emptyBody")} />
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={series}
            rowKey={(r) => r.mint}
            empty={t("empty")}
          />
        </Card>
      )}
    </div>
  );
}
