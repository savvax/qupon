import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { listInvestors, listSeries, type InvestorDTO } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { metaTitle } from "@/lib/meta";
import { getNetwork } from "@/lib/network";
import {
  DVP_PROGRAM,
  legFunded,
  listTrades,
  type TradeDTO,
} from "@/lib/trades";
import { SeriesPicker } from "../_components/SeriesPicker";
import { NewTradeDialog } from "./NewTradeDialog";
import { TradeRowActions } from "./TradeRowActions";

export async function generateMetadata() {
  return { title: await metaTitle("registrarTrades") };
}

const STATUS_TONE = {
  awaiting_funding: "warn",
  ready: "success",
  closed: "neutral",
} as const;

/**
 * Secondary trades of a series (plan 13, docs/03-domain.md §4a): the registrar records a trade two investors agreed
 * on, the parties fund their legs, and the registrar settles both legs atomically through the Solana DvP program.
 */
export default async function RegistrarTrades({
  searchParams,
}: {
  searchParams: Promise<{ mint?: string }>;
}) {
  const t = await getTranslations("trades");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const { mint: wanted } = await searchParams;
  const [series, network] = await Promise.all([
    listSeries().catch(() => []),
    getNetwork(),
  ]);
  const selected = series.find((s) => s.mint === wanted) ?? series[0];
  const [trades, investors] = selected
    ? await Promise.all([
        listTrades(selected.mint)
          .then((r) => r.items ?? [])
          .catch(() => [] as TradeDTO[]),
        listInvestors(selected.mint).catch(() => [] as InvestorDTO[]),
      ])
    : [[], []];

  // each party with the mark of the leg it funds: seller → bonds, buyer → cash
  const party = (row: TradeDTO, side: "seller" | "buyer") => {
    const funded = legFunded(row, side);
    const state = t(funded ? "leg.funded" : "leg.pending");
    return (
      <span className="flex flex-col items-start gap-1">
        <Address value={row[side]} />
        {row.status !== "closed" && (
          <span
            title={`${t(side === "seller" ? "leg.bonds" : "leg.cash")}: ${state}`}
          >
            <Badge tone={funded ? "success" : "neutral"} dot={funded}>
              {state}
            </Badge>
          </span>
        )}
      </span>
    );
  };
  const columns: Column<TradeDTO>[] = [
    {
      key: "seller",
      header: t("col.seller"),
      render: (r) => party(r, "seller"),
    },
    {
      key: "buyer",
      header: t("col.buyer"),
      render: (r) => party(r, "buyer"),
    },
    {
      key: "units",
      header: t("col.units"),
      align: "right",
      essential: true,
      render: (r) => <span className="num">{r.units}</span>,
    },
    {
      key: "cash",
      header: t("col.cash"),
      align: "right",
      essential: true,
      render: (r) => (
        <Amount
          minor={r.cashAmount.minor}
          currency={r.cashAmount.currency}
          locale={locale}
        />
      ),
    },
    {
      key: "status",
      header: `${t("col.status")} · ${t("col.admitted")}`,
      essential: true,
      render: (r) => (
        <>
          <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>
            {t.has(`status.${r.status}`) ? t(`status.${r.status}`) : r.status}
          </Badge>
          <span className="num mt-1 block text-xs whitespace-nowrap text-n500">
            {formatDateTime(r.admittedAt, locale)}
          </span>
        </>
      ),
    },
    {
      key: "actions",
      header: t("col.actions"),
      align: "right",
      essential: true,
      render: (r) =>
        r.status === "closed" ? (
          <span className="text-n400">—</span>
        ) : (
          <TradeRowActions
            mint={selected?.mint ?? ""}
            swapDvp={r.swapDvp}
            ready={r.status === "ready"}
            // demo funding exists on devnet only; legs already in escrow are skipped
            demoSides={
              network.mainnet
                ? []
                : (["seller", "buyer"] as const).filter(
                    (side) => !legFunded(r, side),
                  )
            }
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
          <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
          <p className="mt-2 max-w-2xl text-sm text-n600">
            <Address value={DVP_PROGRAM} label={t("settledBy")} />
            {". "}
            {t("noMatching")}
          </p>
        </div>
        {selected && (
          <NewTradeDialog
            mint={selected.mint}
            ticker={selected.ticker}
            face={selected.faceValue}
            investors={investors
              .filter((i) => i.status === "Active")
              .map((i) => ({ owner: i.owner, units: i.units }))}
          />
        )}
      </header>

      {!selected ? (
        <EmptyState title={t("noSeries")} body={t("noSeriesBody")} />
      ) : (
        <>
          <SeriesPicker
            basePath="/registrar/trades"
            mint={selected.mint}
            series={series.map((s) => ({ mint: s.mint, ticker: s.ticker }))}
          />
          <DataTable
            columns={columns}
            rows={trades}
            rowKey={(r) => r.swapDvp}
            empty={t("empty")}
          />
        </>
      )}
    </div>
  );
}
