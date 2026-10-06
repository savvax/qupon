import { metaTitle } from "@/lib/meta";
import { getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { boFetch } from "@/lib/bo";
import { AddAssetDialog } from "./AddAssetDialog";
import { AuthorityBadges, EnabledSwitch, type AssetDTO } from "./AssetRow";
import { tokenProgramName } from "./tokenProgram";

export async function generateMetadata() {
  return { title: await metaTitle("adminAssets") };
}

/** Admin cash-asset registry (§5.1): every asset of this network, disabled ones included. */
export default async function AdminAssetsPage() {
  const t = await getTranslations("assets.admin");
  const assets =
    (await boFetch<AssetDTO[]>("admin/assets").catch(() => [])) ?? [];

  const columns: Column<AssetDTO>[] = [
    {
      key: "symbol",
      header: t("table.symbol"),
      render: (a) =>
        a.symbol ? (
          <span className="flex items-center gap-2 font-bold">
            <span className="whitespace-nowrap">{a.symbol}</span>
            <Address value={a.mint} />
          </span>
        ) : (
          <Address value={a.mint} />
        ),
    },
    {
      key: "name",
      header: t("table.name"),
      render: (a) =>
        a.name || <span className="text-n400">{a.mint.slice(0, 4)}…</span>,
    },
    {
      key: "kind",
      header: t("table.kind"),
      render: (a) => (
        <Badge tone="neutral">
          {t(`kinds.${a.kind}`, { defaultValue: a.kind })}
        </Badge>
      ),
    },
    {
      key: "decimals",
      header: t("table.decimals"),
      align: "right",
      hideBelow: "md",
      render: (a) => <span className="num">{a.decimals}</span>,
    },
    {
      key: "tokenProgram",
      header: t("table.tokenProgram"),
      hideBelow: "md",
      render: (a) => tokenProgramName(a.tokenProgram),
    },
    {
      key: "authorities",
      header: t("table.authorities"),
      hideBelow: "lg",
      render: (a) => <AuthorityBadges a={a} />,
    },
    {
      key: "enabled",
      header: t("table.enabled"),
      align: "right",
      render: (a) => <EnabledSwitch a={a} />,
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
        <AddAssetDialog />
      </header>
      <Card>
        <DataTable
          columns={columns}
          rows={assets}
          rowKey={(a) => a.mint}
          empty={t("empty")}
        />
      </Card>
    </div>
  );
}
