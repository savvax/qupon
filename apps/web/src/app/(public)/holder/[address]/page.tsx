import { notFound } from "next/navigation";
import { isAddress } from "@solana/kit";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { Kpi } from "@/components/ui/Kpi";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import {
  getHolder,
  type HolderEntitlement,
  type HolderPosition,
} from "@/lib/holder";
import { formatDate, formatDateTime } from "@/lib/format";
import { metaTitle } from "@/lib/meta";

/**
 * Public holder dossier (plan 15 task 1533): `/holder/<address>` renders `GET /holders/{owner}` with no login —
 * anyone can check any wallet's positions, payout routes and payouts (public devnet state). Every payout row shows
 * gross, withheld tax and net.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address } = await params;
  return {
    title: await metaTitle("holder", { address: address.slice(0, 4) + "…" }),
  };
}

export default async function HolderPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: owner } = await params;
  if (!isAddress(owner)) notFound();
  const t = await getTranslations("holder");
  const locale = (await getLocale()) as "en" | "ru" | "kk";

  const h = await getHolder(owner).catch(() => null);
  if (!h) {
    return <EmptyState title={t("notFoundTitle")} body={t("notFoundBody")} />;
  }

  const paid = h.entitlements.filter((e) => e.status === "Paid");
  // Received to date, grouped per currency — tiyn and USDC micro-units never go into one sum.
  const received = new Map<string, bigint>();
  for (const e of paid) {
    const m = e.net ?? e.gross;
    if (!m) continue;
    received.set(
      m.currency,
      (received.get(m.currency) ?? 0n) +
        BigInt(m.minor) +
        BigInt(e.principal?.minor ?? "0"),
    );
  }

  const positionColumns: Column<HolderPosition>[] = [
    {
      key: "ticker",
      header: t("col.series"),
      essential: true,
      render: (p) => (
        <span>
          <span className="font-semibold">{p.ticker}</span>
          <span className="block text-xs text-n500">{p.isin}</span>
        </span>
      ),
    },
    {
      key: "units",
      header: t("col.units"),
      align: "right",
      essential: true,
      render: (p) => <span className="num">{p.units}</span>,
    },
    {
      key: "kyc",
      header: t("col.kyc"),
      hideBelow: "md",
      render: (p) =>
        p.kyc.attested ? (
          <Badge tone="success">
            {t("kycOk")}
            <span className="ml-1 font-normal opacity-80">
              (SAS · SIMULATED)
            </span>
          </Badge>
        ) : (
          <Badge tone="neutral">{t("kycNone")}</Badge>
        ),
    },
    {
      key: "route",
      header: t("col.route"),
      hideBelow: "md",
      render: (p) =>
        p.payoutRoute ? (
          <span>
            <Badge tone={p.payoutRoute.route === "bank" ? "warn" : "info"}>
              {t(`route.${p.payoutRoute.route}`)}
            </Badge>
            {p.payoutRoute.route === "bank" && (
              <ProvenanceChip kind="simulated" className="ml-1" />
            )}
            {p.payoutRoute.bankRefHash && (
              <span className="num block text-xs text-n500">
                {p.payoutRoute.bankRefHash.slice(0, 10)}…
              </span>
            )}
          </span>
        ) : (
          <span className="text-n400">—</span>
        ),
    },
    {
      key: "account",
      header: t("col.account"),
      hideBelow: "lg",
      render: (p) => <Address value={p.bondAta} />,
    },
  ];

  const payoutColumns: Column<HolderEntitlement>[] = [
    {
      key: "action",
      header: t("col.action"),
      essential: true,
      render: (e) => (
        <span>
          <span className="font-semibold">{e.kind}</span>
          <span className="num block text-xs text-n500">
            {e.actionPda.slice(0, 8)}…
          </span>
        </span>
      ),
    },
    {
      key: "units",
      header: t("col.units"),
      align: "right",
      essential: true,
      render: (e) => <span className="num">{e.units}</span>,
    },
    {
      key: "gross",
      header: t("col.gross"),
      align: "right",
      essential: true,
      render: (e) =>
        e.gross ? (
          <Amount
            minor={e.gross.minor}
            currency={e.gross.currency}
            locale={locale}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "tax",
      header: t("col.tax"),
      align: "right",
      essential: true,
      render: (e) =>
        e.tax ? (
          <Amount
            minor={e.tax.minor}
            currency={e.tax.currency}
            locale={locale}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "net",
      header: t("col.net"),
      align: "right",
      essential: true,
      render: (e) =>
        e.net ? (
          <Amount
            minor={e.net.minor}
            currency={e.net.currency}
            locale={locale}
          />
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      header: t("col.status"),
      essential: true,
      render: (e) => <Badge status={e.status} />,
    },
    {
      key: "paid",
      header: t("col.paidTx"),
      hideBelow: "md",
      render: (e) =>
        e.paidTx && e.paidTxUrl ? (
          <a
            href={e.paidTxUrl}
            target="_blank"
            rel="noreferrer"
            className="num text-xs underline decoration-n300 underline-offset-2 hover:decoration-g500"
          >
            {e.paidTx.slice(0, 8)}…
          </a>
        ) : (
          <span className="text-n400">—</span>
        ),
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <header>
        <h1 className="text-title font-extrabold tracking-tight">
          {t("title")}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-n600">
          <Address value={h.owner} />
          {/* Hide the separator below sm so the note never leads a wrapped line. */}
          <span className="max-sm:basis-full">
            <span aria-hidden className="max-sm:hidden">
              {"·\u00A0"}
            </span>
            {t("subtitle")}
          </span>
        </p>
      </header>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Kpi label={t("kpi.series")} value={String(h.positions.length)} />
        <Kpi label={t("kpi.payouts")} value={String(paid.length)} />
        <Kpi
          label={t("kpi.received")}
          value={
            received.size > 0 ? (
              <>
                {[...received].map(([currency, minor]) => (
                  <span key={currency} className="block">
                    <Amount minor={minor} currency={currency} locale={locale} />
                  </span>
                ))}
              </>
            ) : (
              "—"
            )
          }
        />
      </div>

      <section aria-labelledby="holder-positions" className="mt-10">
        <h2 id="holder-positions" className="mb-3 text-lg font-bold">
          {t("positions")}
        </h2>
        {h.positions.length === 0 ? (
          <EmptyState
            title={t("positionsEmpty")}
            body={t("positionsEmptyBody")}
          />
        ) : (
          <DataTable
            rows={h.positions}
            rowKey={(p) => p.mint}
            columns={positionColumns}
          />
        )}
      </section>

      <section aria-labelledby="holder-payouts" className="mt-10">
        <h2 id="holder-payouts" className="mb-3 text-lg font-bold">
          {t("payouts")}
        </h2>
        {h.entitlements.length === 0 ? (
          <EmptyState title={t("payoutsEmpty")} body={t("payoutsEmptyBody")} />
        ) : (
          <DataTable
            rows={h.entitlements}
            rowKey={(e) => e.pda}
            columns={payoutColumns}
          />
        )}
      </section>

      {h.upcomingPayouts.length > 0 && (
        <section aria-labelledby="holder-upcoming" className="mt-10">
          <h2 id="holder-upcoming" className="mb-3 text-lg font-bold">
            {t("upcoming")}
          </h2>
          <ul className="divide-y divide-n200 rounded-card border border-n200">
            {h.upcomingPayouts.map((u, i) => (
              <li
                key={i}
                className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
              >
                <span className="font-semibold">{u.ticker}</span>
                <span className="text-n600">{u.kind}</span>
                <span className="num text-xs text-n600">
                  {t("record")} {formatDateTime(u.recordAt, locale)} ·{" "}
                  {t("payment")} {formatDate(u.paymentAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
