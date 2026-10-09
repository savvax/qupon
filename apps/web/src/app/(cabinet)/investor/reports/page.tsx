import { getLocale, getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/locale";
import { Amount } from "@/components/ui/Amount";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Kpi } from "@/components/ui/Kpi";
import { formatDate } from "@/lib/format";
import { currencyDecimals, majorToMinor } from "@/lib/ui/amount";
import {
  csvHref,
  getStatement,
  getTax,
  printHref,
  type PayoutRow,
  type PayoutTotals,
} from "@/lib/reports";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("reports.investor");
  return { title: `${t("title")} · Qupon` };
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Statement + tax certificate for the signed-in investor's verified wallets (platform v2 §5.4). */
export default async function InvestorReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; year?: string }>;
}) {
  const user = await getSession();
  const sp = await searchParams;
  const from = YMD.test(sp.from ?? "") ? sp.from : undefined;
  const to = YMD.test(sp.to ?? "") ? sp.to : undefined;
  const year = /^\d{4}$/.test(sp.year ?? "")
    ? Number(sp.year)
    : new Date().getFullYear();

  const statement = user
    ? await getStatement(from, to).catch(() => null)
    : null;
  const tax = user ? await getTax(year).catch(() => null) : null;

  const locale = toLocale(await getLocale());
  const [t, tc, tm, tk] = await Promise.all([
    getTranslations("reports.investor"),
    getTranslations("reports.cols"),
    getTranslations("reports.totals"),
    getTranslations("landing.kinds"),
  ]);

  const hasPrincipal = (ps: PayoutRow[]) => ps.some((p) => p.principal > 0);
  const cols = (withPrincipal: boolean): Column<PayoutRow>[] => [
    {
      key: "paymentDate",
      header: tc("paymentDate"),
      render: (p) => (
        <span className="num">{formatDate(p.paymentDate, locale)}</span>
      ),
    },
    {
      key: "series",
      header: tc("series"),
      render: (p) => (
        <span className="font-semibold">
          {p.series} <span className="num text-xs text-n500">{p.isin}</span>
        </span>
      ),
    },
    {
      key: "kind",
      header: tc("kind"),
      hideBelow: "md",
      render: (p) => (
        <span className="flex items-center gap-1.5">
          <Badge tone="neutral">{p.kind}</Badge>
          {tk.has(p.kind) ? tk(p.kind) : p.kind}
        </span>
      ),
    },
    {
      key: "units",
      header: tc("units"),
      align: "right",
      hideBelow: "md",
      render: (p) => <span className="num">{p.units}</span>,
    },
    {
      key: "gross",
      header: tc("gross"),
      align: "right",
      render: (p) => (
        <Amount
          minor={p.gross}
          currency={p.currency}
          decimals={p.decimals}
          locale={locale}
        />
      ),
    },
    {
      key: "tax",
      header: tc("tax"),
      align: "right",
      render: (p) => (
        <Amount
          minor={p.tax}
          currency={p.currency}
          decimals={p.decimals}
          locale={locale}
        />
      ),
    },
    {
      key: "net",
      header: tc("net"),
      align: "right",
      render: (p) => (
        <Amount
          minor={p.net}
          currency={p.currency}
          decimals={p.decimals}
          locale={locale}
        />
      ),
    },
    ...(withPrincipal
      ? ([
          {
            key: "principal",
            header: tc("principal"),
            align: "right",
            render: (p) => (
              <Amount
                minor={p.principal}
                currency={p.currency}
                decimals={p.decimals}
                locale={locale}
              />
            ),
          },
        ] as Column<PayoutRow>[])
      : []),
    {
      key: "status",
      header: tc("status"),
      render: (p) => <Badge status={p.status} />,
    },
    {
      key: "action",
      header: tc("action"),
      hideBelow: "lg",
      render: (p) => <Address value={p.action} />,
    },
  ];

  const totalsCards = (totals: PayoutTotals[]) =>
    totals.map((x) => {
      // Totals are major-unit strings at the currency's own decimals (Go reports.Sum); <Amount> takes minor units.
      const minor = (v: string) =>
        majorToMinor(v, currencyDecimals(x.currency));
      return (
        <div
          key={x.currency}
          className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4"
        >
          <Kpi
            label={tc("gross")}
            value={
              <Amount
                minor={minor(x.gross)}
                currency={x.currency}
                locale={locale}
                className="text-base"
              />
            }
          />
          <Kpi
            label={tc("tax")}
            value={
              <Amount
                minor={minor(x.tax)}
                currency={x.currency}
                locale={locale}
                className="text-base"
              />
            }
          />
          <Kpi
            label={tc("net")}
            value={
              <Amount
                minor={minor(x.net)}
                currency={x.currency}
                locale={locale}
                className="text-base"
              />
            }
          />
          <Kpi
            label={tc("principal")}
            value={
              Number(x.principal) > 0 ? (
                <Amount
                  minor={minor(x.principal)}
                  currency={x.currency}
                  locale={locale}
                  className="text-base"
                />
              ) : (
                "—"
              )
            }
            hint={tm("payouts", { n: x.payouts })}
          />
        </div>
      );
    });

  const inputCx =
    "rounded-btn border border-n300 bg-n0 px-3 py-2 text-sm text-n900 focus:border-g600 focus:outline-none";

  return (
    <div className="mx-auto max-w-[1200px]">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
      </header>

      {!user ? (
        <Card padding="lg">{t("gate")}</Card>
      ) : (
        <div className="space-y-10">
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t("statement.title")}</h2>
              <div className="flex gap-2">
                <Button asChild variant="secondary" size="sm">
                  <a href={csvHref("me/reports/statement", { from, to })}>
                    {t("statement.csv")}
                  </a>
                </Button>
                <Button asChild variant="secondary" size="sm">
                  <a href={printHref("statement", { from, to })}>
                    {t("statement.print")}
                  </a>
                </Button>
              </div>
            </div>
            {/* Plain GET form: server-rendered filtering, no client JS needed. */}
            <form
              method="get"
              action="/investor/reports"
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="year" value={year} />
              <label className="text-sm font-semibold text-n800">
                {t("statement.from")}
                <input
                  type="date"
                  name="from"
                  defaultValue={from}
                  className={`mt-1 block ${inputCx}`}
                />
              </label>
              <label className="text-sm font-semibold text-n800">
                {t("statement.to")}
                <input
                  type="date"
                  name="to"
                  defaultValue={to}
                  className={`mt-1 block ${inputCx}`}
                />
              </label>
              <Button type="submit" variant="secondary" size="sm">
                {t("statement.apply")}
              </Button>
            </form>
            {statement ? (
              <>
                {statement.payouts.length > 0 && (
                  <div className="mb-4">{totalsCards(statement.totals)}</div>
                )}
                <DataTable
                  columns={cols(hasPrincipal(statement.payouts))}
                  rows={statement.payouts}
                  rowKey={(p) => `${p.action}-${p.owner}`}
                  empty={t("statement.empty")}
                />
              </>
            ) : (
              <Card padding="lg">{t("statement.empty")}</Card>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">{t("tax.title")}</h2>
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="sm">
                  <a href={csvHref("me/reports/tax", { year })}>
                    {t("tax.csv")}
                  </a>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <a href={printHref("tax", { year })}>{t("tax.print")}</a>
                </Button>
              </div>
            </div>
            <p className="mb-4 max-w-2xl text-sm text-n600">{t("tax.lead")}</p>
            <form
              method="get"
              action="/investor/reports"
              className="mb-4 flex flex-wrap items-end gap-3"
            >
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <label className="text-sm font-semibold text-n800">
                {t("tax.year")}
                <select
                  name="year"
                  defaultValue={year}
                  className={`mt-1 block ${inputCx}`}
                >
                  {/* −4…+4: demo data settles future-dated redemptions too */}
                  {[-4, -3, -2, -1, 0, 1, 2, 3, 4]
                    .map((d) => new Date().getFullYear() + d)
                    .map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                </select>
              </label>
              <Button type="submit" variant="secondary" size="sm">
                {t("tax.apply")}
              </Button>
            </form>
            {tax ? (
              <>
                {tax.payouts.length > 0 && (
                  <div className="mb-4">{totalsCards(tax.totals)}</div>
                )}
                <DataTable
                  columns={cols(hasPrincipal(tax.payouts))}
                  rows={tax.payouts}
                  rowKey={(p) => `${p.action}-${p.owner}`}
                  empty={t("tax.empty", { year })}
                />
              </>
            ) : (
              <Card padding="lg">{t("tax.empty", { year })}</Card>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
