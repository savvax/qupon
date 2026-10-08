import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { notFound, redirect } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatDate, formatDateTime } from "@/lib/format";
import { majorToMinor } from "@/lib/ui/amount";
import {
  csvHref,
  getHolders,
  getPayouts,
  getStatement,
  getTax,
  type HoldersReport,
  type PayoutRow,
  type PayoutTotals,
  type StatementReport,
  type TaxReport,
} from "@/lib/reports";
import { getSession } from "@/lib/session";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

type Slug = "statement" | "tax" | "holders" | "payouts";

const SLUGS: Record<string, Slug> = {
  statement: "statement",
  tax: "tax",
  holders: "holders",
  payouts: "payouts",
};

const short = (v: string) =>
  v.length > 12 ? `${v.slice(0, 4)}…${v.slice(-4)}` : v;

/** Printable view of any report (platform v2 §5.4): "Save as PDF" is the browser's print dialog. */
export default async function PrintReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ report: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
    year?: string;
    mint?: string;
    pda?: string;
  }>;
}) {
  const slug = SLUGS[(await params).report] as Slug | undefined;
  if (!slug) notFound();
  const sp = await searchParams;

  // Same access matrix as the Go endpoints (mountReports): admin passes every role check.
  const user = await getSession();
  if (!user) redirect(`/login?next=/print/${slug}`);
  const role = user.role;
  if (slug === "holders" && role !== "registrar" && role !== "admin")
    return <Gate kind="forbidden" />;
  if (
    slug === "payouts" &&
    role !== "issuer" &&
    role !== "registrar" &&
    role !== "admin"
  )
    return <Gate kind="forbidden" />;

  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const t = await getTranslations("reports");

  const year = /^\d{4}$/.test(sp.year ?? "")
    ? Number(sp.year)
    : new Date().getFullYear();

  let data: StatementReport | TaxReport | HoldersReport | null = null;
  let query: Record<string, string | number | undefined> = {};
  let path = "";
  if (slug === "statement") {
    query = { from: sp.from, to: sp.to };
    path = "me/reports/statement";
    data = await getStatement(sp.from, sp.to).catch(() => null);
  } else if (slug === "tax") {
    query = { year };
    path = "me/reports/tax";
    data = await getTax(year).catch(() => null);
  } else if (slug === "holders") {
    if (!sp.mint) notFound();
    query = {};
    path = `registrar/reports/holders/${sp.mint}`;
    data = await getHolders(sp.mint).catch(() => null);
  } else {
    if (!sp.pda) notFound();
    query = {};
    path = `issuer/reports/payouts/${sp.pda}`;
    data = await getPayouts(sp.pda).catch(() => null);
  }
  if (!data) return <Gate kind="loadFailed" />;

  const back =
    slug === "holders"
      ? "/registrar/reports"
      : slug === "payouts"
        ? "/issuer"
        : "/investor/reports";

  const isHolders = slug === "holders";
  const payouts = isHolders ? [] : (data as StatementReport).payouts;
  const holders = isHolders ? (data as HoldersReport).holders : [];
  const totals: PayoutTotals[] = isHolders
    ? []
    : (data as StatementReport).totals;

  const meta: [string, string][] = [
    [t("meta.network"), data.network],
    [t("meta.generatedAt"), formatDateTime(data.generatedAt, locale)],
    ...(slug === "statement"
      ? [
          [t("meta.period"), `${sp.from ?? "—"} – ${sp.to ?? "—"}`] as [
            string,
            string,
          ],
        ]
      : []),
    ...(slug === "tax"
      ? ([[t("meta.year"), String(year)]] as [string, string][])
      : []),
    ...(slug === "holders"
      ? ([[t("registrar.series"), short(sp.mint!)]] as [string, string][])
      : []),
    ...(slug === "payouts"
      ? ([[t("cols.action"), short(sp.pda!)]] as [string, string][])
      : []),
    [t("meta.sources"), data.sources.map(short).join(", ")],
  ];

  return (
    <div className="mx-auto max-w-[860px] px-4 print:max-w-none print:px-0">
      {/* Toolbar never prints. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href={back}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-g700 hover:underline"
        >
          <Icon name="arrowLeft" className="size-4" />
          {t("print.back")}
        </Link>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <a href={csvHref(path, query)}>{t("print.csv")}</a>
          </Button>
          <PrintButton />
        </div>
      </div>

      <article className="rounded-card bg-n0 p-8 shadow-card print:rounded-none print:p-0 print:shadow-none">
        <header className="flex items-baseline justify-between border-b border-n200 pb-4">
          <h1 className="text-xl font-extrabold tracking-tight">
            Qupon · {t(`print.${slug}Title`)}
          </h1>
          <span className="text-xs font-semibold text-n500">
            {data.network}
          </span>
        </header>

        <dl className="mt-4 grid gap-x-8 gap-y-1 text-xs sm:grid-cols-2">
          {meta.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="font-semibold text-n500">{k}:</dt>
              <dd className="num min-w-0 break-words text-n800">{v}</dd>
            </div>
          ))}
        </dl>
        {/* Wide report tables scroll inside their own box on phones (§5.8: no page-level sideways scroll). */}
        <div className="mt-6 overflow-x-auto print:overflow-visible">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-n300 text-left">
                {isHolders
                  ? [
                      t("cols.owner"),
                      t("cols.units"),
                      t("cols.investorType"),
                      t("cols.residency"),
                      t("cols.taxBps"),
                      t("cols.status"),
                      t("cols.kycRef"),
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-1 py-1.5 font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))
                  : [
                      t("cols.paymentDate"),
                      t("cols.series"),
                      t("cols.kind"),
                      t("cols.units"),
                      t("cols.gross"),
                      t("cols.tax"),
                      t("cols.net"),
                      ...(payouts.some((p: PayoutRow) => p.principal > 0)
                        ? [t("cols.principal")]
                        : []),
                      t("cols.status"),
                      t("cols.action"),
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-1 py-1.5 font-semibold whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
              </tr>
            </thead>
            <tbody>
              {isHolders
                ? holders.map((h) => (
                    <tr key={h.owner} className="border-b border-n100">
                      <td className="num px-1 py-1.5">{short(h.owner)}</td>
                      <td className="num px-1 py-1.5 text-right">{h.units}</td>
                      <td className="px-1 py-1.5">{h.investorType}</td>
                      <td className="px-1 py-1.5">{h.residency}</td>
                      <td className="num px-1 py-1.5 text-right">
                        {h.taxBps / 100}%
                      </td>
                      <td className="px-1 py-1.5">
                        <Badge status={h.status} />
                      </td>
                      <td className="num px-1 py-1.5">{short(h.kycRef)}</td>
                    </tr>
                  ))
                : payouts.map((p) => (
                    <tr
                      key={`${p.action}-${p.owner}`}
                      className="border-b border-n100"
                    >
                      <td className="num px-1 py-1.5 whitespace-nowrap">
                        {formatDate(p.paymentDate, locale)}
                      </td>
                      <td className="px-1 py-1.5 whitespace-nowrap">
                        {p.series}
                        <span className="num ml-1.5 text-n400">{p.isin}</span>
                      </td>
                      <td className="px-1 py-1.5">{p.kind}</td>
                      <td className="num px-1 py-1.5 text-right">{p.units}</td>
                      <td className="px-1 py-1.5 text-right">
                        <Amount
                          minor={p.gross}
                          currency={p.currency}
                          decimals={p.decimals}
                          locale={locale}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <Amount
                          minor={p.tax}
                          currency={p.currency}
                          decimals={p.decimals}
                          locale={locale}
                        />
                      </td>
                      <td className="px-1 py-1.5 text-right">
                        <Amount
                          minor={p.net}
                          currency={p.currency}
                          decimals={p.decimals}
                          locale={locale}
                        />
                      </td>
                      {p.principal > 0 && (
                        <td className="px-1 py-1.5 text-right">
                          <Amount
                            minor={p.principal}
                            currency={p.currency}
                            decimals={p.decimals}
                            locale={locale}
                          />
                        </td>
                      )}
                      <td className="px-1 py-1.5">
                        <Badge status={p.status} />
                      </td>
                      <td className="num px-1 py-1.5">{short(p.action)}</td>
                    </tr>
                  ))}
            </tbody>
            {!isHolders && totals.length > 0 && (
              <tfoot>
                {totals.map((x) => (
                  <tr
                    key={x.currency}
                    className="border-t-2 border-n400 font-semibold"
                  >
                    <td colSpan={4} className="px-1 py-1.5">
                      {t("totals.title")} ·{" "}
                      {t("totals.payouts", { n: x.payouts })}
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <Amount
                        minor={majorToMinor(x.gross, 2)}
                        currency={x.currency}
                        locale={locale}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <Amount
                        minor={majorToMinor(x.tax, 2)}
                        currency={x.currency}
                        locale={locale}
                      />
                    </td>
                    <td className="px-1 py-1.5 text-right">
                      <Amount
                        minor={majorToMinor(x.net, 2)}
                        currency={x.currency}
                        locale={locale}
                      />
                    </td>
                    {payouts.some((p: PayoutRow) => p.principal > 0) && (
                      <td className="px-1 py-1.5 text-right">
                        {Number(x.principal) > 0 ? (
                          <Amount
                            minor={majorToMinor(x.principal, 2)}
                            currency={x.currency}
                            locale={locale}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                    )}
                    <td colSpan={2} />
                  </tr>
                ))}
              </tfoot>
            )}
          </table>
        </div>

        <footer className="mt-6 border-t border-n200 pt-3 text-[10px] text-n400">
          {t("print.footer")}
        </footer>
      </article>
    </div>
  );
}

async function Gate({ kind }: { kind: "forbidden" | "loadFailed" }) {
  const t = await getTranslations("reports.print");
  return (
    <div className="mx-auto mt-16 max-w-md rounded-card border border-n200 bg-n0 p-6 text-center text-sm text-n700 print:hidden">
      {t(kind)}
    </div>
  );
}
