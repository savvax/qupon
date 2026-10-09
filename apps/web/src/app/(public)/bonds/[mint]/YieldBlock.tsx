import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Amount } from "@/components/ui/Amount";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { formatDate } from "@/lib/format";
import { type Locale } from "@/i18n/locale";

type Money = { minor: string; currency: string };

/**
 * Price and yield, fed by props: accrued interest is computed from the schedule today (30E/360); clean / dirty
 * price and YTM come with the secondary-market data (task 1535) and read "—" until then.
 */
export function YieldBlock({
  accrued,
  clean,
  dirty,
  ytm,
  asOf,
  locale,
}: {
  accrued?: Money | null;
  /** Percent of face, e.g. "100.25" */
  clean?: string | null;
  dirty?: Money | null;
  /** Percent per year, e.g. "11.84" */
  ytm?: string | null;
  asOf: string;
  locale: Locale;
}) {
  const t = useTranslations("bond.yield");
  const dash = <span className="text-n400">—</span>;
  const rows: [ReactNode, ReactNode][] = [
    [
      <GlossaryTerm key="a" term="accrued">
        {t("accrued")}
      </GlossaryTerm>,
      accrued ? (
        <Amount
          minor={accrued.minor}
          currency={accrued.currency}
          locale={locale}
        />
      ) : (
        dash
      ),
    ],
    [
      <GlossaryTerm key="c" term="cleanDirty">
        {t("clean")}
      </GlossaryTerm>,
      clean ? <span className="num">{clean}%</span> : dash,
    ],
    [
      t("dirty"),
      dirty ? (
        <Amount minor={dirty.minor} currency={dirty.currency} locale={locale} />
      ) : (
        dash
      ),
    ],
    [
      <GlossaryTerm key="y" term="ytm">
        {t("ytm")}
      </GlossaryTerm>,
      ytm ? <span className="num">{ytm}%</span> : dash,
    ],
  ];
  return (
    <section className="rounded-card border border-n200 bg-n0 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>
      <p className="num text-xs text-n500">
        {t("asOf", { date: formatDate(asOf, locale) })}
      </p>
      <dl className="mt-3 divide-y divide-n100 text-sm">
        {rows.map(([k, v], i) => (
          <div
            key={i}
            className="flex items-baseline justify-between gap-3 py-2.5"
          >
            <dt className="text-n700">{k}</dt>
            <dd className="font-semibold text-n900">{v}</dd>
          </div>
        ))}
      </dl>
      {!clean && <p className="mt-2 text-xs text-n500">{t("noTrades")}</p>}
    </section>
  );
}
