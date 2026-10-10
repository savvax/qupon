"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Amount } from "@/components/ui/Amount";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { TextField } from "@/components/ui/TextField";
import { cx } from "@/lib/ui/cx";
import { formatDate } from "@/lib/format";
import { type Locale } from "@/i18n/locale";
import { accruedSigned } from "@qupon/client/src/lib/accrued";
import { DayCount, type Ymd, ymd } from "@qupon/client/src/lib/daycount";
import { currentYield, ytm } from "@qupon/client/src/lib/yield";

const DAY_COUNT: Record<string, DayCount> = {
  THIRTY_360: DayCount.Thirty360,
  ACT_365: DayCount.Act365,
  ACT_ACT: DayCount.ActAct,
};

const parseYmd = (iso: string): Ymd => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number) as [
    number,
    number,
    number,
  ];
  return ymd(y, m, d);
};

/**
 * Price and yield with the trade-ticket preview (task 1535). The reference price starts at par; entering
 * a clean price recomputes the accrued/dirty split for N bonds, the current yield and the YTM with the
 * same math the chain and the CLI use (`@qupon/client` yield.ts, task 1502). No market feed exists on
 * devnet — the ticket is a what-if calculator, and it says so.
 */
export function YieldBlock({
  face,
  rateBps,
  frequency,
  dayCount,
  currency,
  issueDate,
  maturityDate,
  periodStart,
  today,
  redeemed,
  locale,
}: {
  /** face value per bond (minor units) */
  face: bigint;
  rateBps: number;
  frequency: number;
  dayCount: string;
  currency: string;
  issueDate: string;
  maturityDate: string;
  /** current coupon period start ("YYYY-MM-DD"), null between periods */
  periodStart: string | null;
  /** Almaty civil date the numbers are computed for ("YYYY-MM-DD") */
  today: string;
  /** matured or closed: no accrued interest exists, the ticket is meaningless */
  redeemed: boolean;
  locale: Locale;
}) {
  const t = useTranslations("bond.yield");
  const [units, setUnits] = useState("10");
  const [price, setPrice] = useState("100");

  const dc = DAY_COUNT[dayCount] ?? DayCount.Thirty360;
  const settle = parseYmd(today);

  const calc = useMemo(() => {
    // floor: fractional input ("1.5") must never reach BigInt; clamp the rest
    const n = Math.max(0, Math.min(Math.floor(Number(units) || 0), 1_000_000));
    const pct = Number(price);
    const cleanPerUnit =
      Number.isFinite(pct) && pct > 0
        ? (face * BigInt(Math.round(pct * 100))) / 10_000n // minor units
        : 0n;
    // sub-tick price (e.g. 0.001% rounds to 0n): show "invalid", never throw
    if (cleanPerUnit <= 0n) return null;
    const start = periodStart ? parseYmd(periodStart) : parseYmd(issueDate);
    const accruedPerUnit = accruedSigned(1n, face, rateBps, dc, start, settle);
    const accruedN = accruedSigned(BigInt(n), face, rateBps, dc, start, settle);
    const cleanN = cleanPerUnit * BigInt(n);
    const dirtyN = cleanN + accruedN.amount;
    const cy = currentYield(rateBps, face, cleanPerUnit);
    let y: number | null = null;
    try {
      y = ytm({
        cleanPrice: cleanPerUnit,
        face,
        rateBps,
        frequency,
        settle,
        maturity: parseYmd(maturityDate),
        dayCount: dc,
      });
    } catch {
      y = null; // matured or unsolvable at this price: show "—", not an error
    }
    return { n, cleanPerUnit, accruedPerUnit, accruedN, cleanN, dirtyN, cy, y };
  }, [
    units,
    price,
    face,
    rateBps,
    frequency,
    dc,
    issueDate,
    maturityDate,
    periodStart,
    settle,
  ]);

  const dash = <span className="text-n400">—</span>;
  const money = (minor: bigint, strong = false) => (
    <Amount
      minor={minor.toString()}
      currency={currency}
      locale={locale}
      className={strong ? "font-semibold text-n900" : undefined}
    />
  );

  const rows: [ReactNode, ReactNode][] = [
    [
      <GlossaryTerm key="a" term="accrued">
        {t("accrued")}
      </GlossaryTerm>,
      calc && !redeemed ? money(calc.accruedPerUnit.amount) : dash,
    ],
    [
      <GlossaryTerm key="c" term="cleanDirty">
        {t("clean")}
      </GlossaryTerm>,
      calc ? <span className="num">{price}%</span> : dash,
    ],
    [
      t("dirty"),
      calc && !redeemed
        ? money(calc.cleanPerUnit + calc.accruedPerUnit.amount)
        : dash,
    ],
    [
      t("current"),
      calc ? <span className="num">{(calc.cy * 100).toFixed(2)}%</span> : dash,
    ],
    [
      <GlossaryTerm key="y" term="ytm">
        {t("ytm")}
      </GlossaryTerm>,
      calc?.y != null && !redeemed ? (
        <span className="num">{(calc.y * 100).toFixed(2)}%</span>
      ) : (
        dash
      ),
    ],
  ];

  return (
    <section className="rounded-card border border-n200 bg-n0 p-4 sm:p-5">
      <h2 className="text-base font-bold">{t("title")}</h2>
      <p className="num text-xs text-n500">
        {t("asOf", { date: formatDate(`${today}T12:00:00+05:00`, locale) })}
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

      {/* trade ticket: the accrued split for N bonds at the price above (meaningless once redeemed) */}
      {redeemed ? (
        <p className="mt-3 rounded-btn bg-n50 px-3 py-2 text-sm text-n600">
          {t("redeemed")}
        </p>
      ) : (
        <div className="mt-4 rounded-btn border border-n200 bg-n50 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold">{t("ticket.title")}</h3>
            <ProvenanceChip kind="simulated" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-n600">
              {t("ticket.units")}
              <TextField
                type="number"
                min={1}
                value={units}
                onChange={(e) => setUnits(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
            <label className="text-xs font-semibold text-n600">
              {t("ticket.price")}
              <TextField
                type="number"
                min={0.01}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          </div>
          {calc ? (
            <dl className="mt-2 divide-y divide-n100 text-dense">
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-n600">
                  {t("ticket.clean", { n: calc.n })}
                </dt>
                <dd className="num font-semibold">{money(calc.cleanN)}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="text-n600">
                  {t("ticket.accrued", { days: calc.accruedN.days })}
                </dt>
                <dd className="num font-semibold">
                  {money(calc.accruedN.amount)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 py-1.5">
                <dt className="font-bold text-n900">{t("ticket.dirty")}</dt>
                <dd className={cx("num font-bold")}>
                  {money(calc.dirtyN, true)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-xs text-n600">{t("ticket.invalid")}</p>
          )}
          <p className="mt-2 text-xs text-n500">{t("ticket.note")}</p>
        </div>
      )}
    </section>
  );
}
