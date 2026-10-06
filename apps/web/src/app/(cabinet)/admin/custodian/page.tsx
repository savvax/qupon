import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { boFetch } from "@/lib/bo";
import { formatDateTime } from "@/lib/format";
import { metaTitle } from "@/lib/meta";
import { CustodianDialog, type CustodianEntry } from "./CustodianDialog";

type CustodianStatus = {
  asset: { symbol: string; mint: string; decimals: number } | null;
  ledger: CustodianEntry[];
};

export async function generateMetadata() {
  return { title: await metaTitle("adminCustodian") };
}

/**
 * Wrapped digital tenge custodian (§5.1, task 606) — SIMULATED. The real
 * digital tenge is a CBDC off Solana; here the admin records deposit
 * references and mints/burns the custodian-wrapped dKZT 1:1. The ledger is
 * the audit trail of those movements.
 */
export default async function AdminCustodianPage() {
  const t = await getTranslations("assets.custodian");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  let status: CustodianStatus | null = null;
  try {
    status = await boFetch<CustodianStatus>("admin/custodian");
  } catch {
    status = null; // a failed load is an error state, not "no ledger"
  }

  const decimals = status?.asset?.decimals ?? 2;
  const columns: Column<CustodianEntry>[] = [
    {
      key: "ts",
      header: t("table.time"),
      render: (e) => (
        <span className="num whitespace-nowrap">
          {formatDateTime(new Date(e.ts * 1000).toISOString(), locale)}
        </span>
      ),
    },
    {
      key: "kind",
      header: t("table.kind"),
      render: (e) => (
        <Badge
          tone={e.ok ? (e.kind === "deposit" ? "success" : "violet") : "danger"}
        >
          {t(`kinds.${e.kind}`)}
          {!e.ok && ` · ${t("failed")}`}
        </Badge>
      ),
    },
    {
      key: "reference",
      header: t("table.reference"),
      render: (e) => (
        <span className="font-semibold">{e.reference || "—"}</span>
      ),
    },
    {
      key: "amount",
      header: t("table.amount"),
      align: "right",
      render: (e) => (
        <Amount
          minor={String(e.amount)}
          currency={status?.asset?.symbol ?? "dKZT"}
          decimals={decimals}
          locale={locale}
          className="whitespace-nowrap"
        />
      ),
    },
    {
      key: "to",
      header: t("table.treasury"),
      hideBelow: "md",
      render: (e) =>
        e.to ? <Address value={e.to} /> : <span className="text-n400">—</span>,
    },
    {
      key: "email",
      header: t("table.by"),
      hideBelow: "lg",
      render: (e) => e.email || "—",
    },
    {
      key: "signature",
      essential: true,
      header: t("table.signature"),
      hideBelow: "lg",
      render: (e) =>
        e.ok && e.signature ? (
          <Address value={e.signature} kind="tx" />
        ) : (
          <span className="text-n400">—</span>
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
        <CustodianDialog asset={status?.asset ?? null} />
      </header>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-warn-bd bg-warn-bg p-3 text-xs text-warn-fg">
        <Badge tone="warn">{t("simulated")}</Badge>
        <p className="max-w-2xl">{t("simulatedBody")}</p>
      </div>
      {status === null ? (
        <EmptyState title={t("unreachable")} body={t("unreachableBody")} />
      ) : (
        <>
          {status.asset && (
            <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
              <span className="font-bold">{status.asset.symbol}</span>
              <span className="flex items-center gap-1">
                {t("assetMint")} <Address value={status.asset.mint} />
              </span>
              <span className="text-n600">
                {t("assetDecimals", { decimals: status.asset.decimals })}
              </span>
            </Card>
          )}
          <DataTable
            columns={columns}
            rows={status.ledger}
            rowKey={(e) => String(e.id)}
            empty={t("empty")}
          />
        </>
      )}
    </div>
  );
}
