"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { type Locale } from "@/i18n/locale";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Drawer } from "@/components/ui/Dialog";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { couponGross } from "@/lib/accrual";
import { bpsToPercent, formatDate, shortKey } from "@/lib/format";
import { CURRENCY_SIGN, formatAmount, renderDecimals } from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";

type Money = { minor: string; currency: string };
export type RegisterRow = {
  owner: string;
  units: string;
  gross: Money;
  tax: Money;
  net: Money;
  principal: Money;
  status: string;
  tx?: string | null;
};
export type RegisterSet = {
  pda: string;
  /** "Coupon", "Bondholder meeting" (translated kind) */
  label: string;
  recordAt: string;
  cash: boolean;
  /** For the calculation: face (minor), rate (bps) and accrual days of the action (null for non-coupons). */
  faceMinor: string;
  rateBps: number | null;
  days: number | null;
  rows: RegisterRow[];
};

const pct = (part: bigint, whole: bigint) =>
  whole > 0n ? Number((part * 10_000n) / whole) / 100 : 0;

/**
 * Register as of each record date: who held the bond when it counted and what each holder got. Tabs per record
 * date; a row opens the per-holder calculation (30E/360, gross, tax, net) checked against the on-chain amount.
 */
export function RegisterPanel({
  sets,
  initial,
  locale,
}: {
  sets: RegisterSet[];
  initial?: string;
  locale: Locale;
}) {
  const t = useTranslations("bond.register");
  const [pda, setPda] = useState(
    sets.some((s) => s.pda === initial) ? initial! : sets[0]?.pda,
  );
  const [open, setOpen] = useState<RegisterRow | null>(null);
  const set = sets.find((s) => s.pda === pda);

  if (!set)
    return (
      <div className="rounded-card border border-dashed border-n300 bg-n0 px-6 py-10 text-center text-sm text-n600">
        {t("empty")}
      </div>
    );

  const total = set.rows.reduce((a, r) => a + BigInt(r.units), 0n);
  const money = (m: Money, strong = false) => (
    <Amount
      minor={m.minor}
      currency={m.currency}
      locale={locale}
      className={strong ? "font-semibold text-n900" : undefined}
    />
  );

  // The drawer re-derives the gross from the action's terms and checks it against the chain.
  const calc =
    open && set.cash && set.rateBps !== null && set.days !== null
      ? couponGross(
          BigInt(open.units),
          BigInt(set.faceMinor),
          set.rateBps,
          set.days,
        )
      : null;
  const taxBps =
    open && BigInt(open.gross.minor) > 0n
      ? Number((BigInt(open.tax.minor) * 10_000n) / BigInt(open.gross.minor))
      : 0;

  return (
    <div className="rounded-card border border-n200 bg-n0">
      <div
        role="tablist"
        aria-label={t("title")}
        className="flex gap-1 overflow-x-auto border-b border-n100 px-3 pt-3 [scrollbar-width:none]"
      >
        {sets.map((s) => (
          <button
            key={s.pda}
            type="button"
            role="tab"
            aria-selected={s.pda === pda}
            onClick={() => setPda(s.pda)}
            className={cx(
              "-mb-px shrink-0 rounded-t-btn border-b-2 px-3 pt-1.5 pb-2 text-left text-sm transition-colors",
              s.pda === pda
                ? "border-g600 text-n900"
                : "border-transparent text-n600 hover:text-n900",
            )}
          >
            <span className="block font-bold">{s.label}</span>
            <span className="num block text-xs text-n500">
              {formatDate(s.recordAt, locale)}
            </span>
          </button>
        ))}
      </div>

      {/* ≥ 640 px: a table; phones: one card per holder. Every row opens the calculation. */}
      <table className="hidden w-full text-dense sm:table">
        <thead>
          <tr className="text-left text-xs text-n500">
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {t("holder")}
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-semibold">
              {t("units")}
            </th>
            <th scope="col" className="w-[28%] px-4 py-2.5 font-semibold">
              {t("share")}
            </th>
            {set.cash && (
              <>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right font-semibold max-lg:hidden"
                >
                  {t("gross")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right font-semibold max-lg:hidden"
                >
                  {t("tax")}
                </th>
                <th
                  scope="col"
                  className="px-4 py-2.5 text-right font-semibold"
                >
                  {t("net")}
                </th>
              </>
            )}
            <th scope="col" className="px-4 py-2.5 font-semibold">
              {t("status")}
            </th>
          </tr>
        </thead>
        <tbody>
          {set.rows.map((r) => {
            const share = pct(BigInt(r.units), total);
            return (
              <tr key={r.owner} className="border-t border-n100 hover:bg-n50">
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpen(r)}
                    className="num rounded-sm font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
                  >
                    {shortKey(r.owner)}
                  </button>
                </td>
                <td className="num px-4 py-2.5 text-right font-semibold">
                  {r.units}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-n100">
                      <span
                        className="qp-bar block h-full rounded-full bg-viz-holder"
                        style={{ scale: `${share / 100} 1` }}
                      />
                    </span>
                    <span className="num w-12 text-right text-n600">
                      {share.toFixed(1)}%
                    </span>
                  </span>
                </td>
                {set.cash && (
                  <>
                    <td className="px-4 py-2.5 text-right max-lg:hidden">
                      {money(r.gross)}
                    </td>
                    <td className="px-4 py-2.5 text-right max-lg:hidden">
                      {money(r.tax)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {money(r.net, true)}
                    </td>
                  </>
                )}
                <td className="px-4 py-2.5">
                  <Badge status={r.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <ul className="divide-y divide-n100 sm:hidden">
        {set.rows.map((r) => (
          <li key={r.owner}>
            <button
              type="button"
              onClick={() => setOpen(r)}
              className="w-full px-4 py-3 text-left"
            >
              <span className="flex items-baseline justify-between gap-3">
                <span className="num font-semibold text-g700">
                  {shortKey(r.owner)}
                </span>
                {set.cash ? (
                  money(r.net, true)
                ) : (
                  <span className="num font-semibold">{r.units}</span>
                )}
              </span>
              <span className="mt-1 flex items-center justify-between gap-3 text-xs text-n500">
                <span className="num">
                  {t("unitsShare", {
                    units: r.units,
                    share: pct(BigInt(r.units), total).toFixed(1),
                  })}
                </span>
                <Badge status={r.status} />
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="border-t border-n100 px-4 py-2.5 text-xs text-n500">
        {t("total", { units: total.toString(), holders: set.rows.length })}{" "}
        <GlossaryTerm term="snapshot">{t("snapshotLink")}</GlossaryTerm>
      </p>

      <Drawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open ? t("calc.title", { who: shortKey(open.owner) }) : ""}
        description={set.label + " · " + formatDate(set.recordAt, locale)}
      >
        {open && (
          <div className="space-y-4 text-sm">
            <Address value={open.owner} />
            {set.cash && set.rateBps !== null && set.days !== null && (
              <div className="rounded-btn bg-n50 p-3">
                <div className="text-xs text-n500">
                  <GlossaryTerm term="dayCount" />
                </div>
                <div className="num mt-1 font-semibold text-n900">
                  {t("calc.formula", {
                    units: open.units,
                    face: `${formatAmount(set.faceMinor, renderDecimals(set.faceMinor, open.gross.currency), locale)} ${CURRENCY_SIGN[open.gross.currency] ?? open.gross.currency}`,
                    rate: bpsToPercent(set.rateBps, locale),
                    days: set.days,
                  })}
                </div>
              </div>
            )}
            {set.cash ? (
              <dl className="divide-y divide-n100">
                {(
                  [
                    [t("gross"), open.gross],
                    [
                      t("calc.tax", { rate: bpsToPercent(taxBps, locale) }),
                      open.tax,
                    ],
                    ...(BigInt(open.principal.minor) > 0n
                      ? [[t("calc.principal"), open.principal] as const]
                      : []),
                    [t("net"), open.net],
                  ] as const
                ).map(([k, v], i, all) => (
                  <div
                    key={k}
                    className="flex items-baseline justify-between gap-3 py-2"
                  >
                    <dt
                      className={
                        i === all.length - 1 ? "font-bold" : "text-n600"
                      }
                    >
                      {k}
                    </dt>
                    <dd>{money(v, i === all.length - 1)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="num">
                {t("unitsShare", {
                  units: open.units,
                  share: pct(BigInt(open.units), total).toFixed(1),
                })}
              </p>
            )}
            {calc !== null && (
              <div className="flex flex-wrap items-center gap-2">
                <ProvenanceChip
                  kind={
                    calc === BigInt(open.gross.minor) ? "verified" : "simulated"
                  }
                >
                  {calc === BigInt(open.gross.minor)
                    ? t("calc.matches")
                    : t("calc.differs")}
                </ProvenanceChip>
                <span className="text-xs text-n500">{t("calc.rounding")}</span>
              </div>
            )}
            {open.tx && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-n600">{t("calc.tx")}</span>
                <Address value={open.tx} kind="tx" />
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
