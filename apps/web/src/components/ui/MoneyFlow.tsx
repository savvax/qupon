"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { type Locale } from "@/i18n/locale";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/ui/cx";
import { ProvenanceChip } from "./ProvenanceChip";

export type FlowRecipient = {
  id: string;
  kind: "holder" | "tax" | "agent";
  /** Holder name or short address; for `agent`, the holder it pays out for goes in `sub`. */
  label: string;
  sub?: string;
  /** Minor units of the cash token (net + principal for a holder, Σ tax for the vault). */
  amount: string;
  status: "paid" | "pending" | "agent" | "defaulted";
  tx?: string | null;
};

export type MoneyFlowProps = {
  currency: string;
  locale: Locale;
  issuer: { label: string; address?: string };
  escrow: {
    address?: string;
    /** What the escrow must hold: Σ net + tax + principal. */
    required: string;
    /** What the issuer put in (≥ required once funded). */
    funded: string;
    fundTx?: string | null;
  };
  recipients: FlowRecipient[];
  /** Defaulted: the shortfall is drawn in red; Cured: funded late, chip on the escrow. */
  state?: "normal" | "defaulted" | "cured";
  title?: string;
  /** Numbers are an example, not chain data: says so under the title. */
  example?: boolean;
  /** Fixture signatures (sandbox, gallery): shown as text, not explorer links. */
  sampleTx?: boolean;
  className?: string;
};

const ROW = 68; // recipient row height (px) — band ends are computed against it
const GAP = 8;

const FILL: Record<FlowRecipient["kind"], string> = {
  holder: "var(--color-viz-holder)",
  tax: "var(--color-viz-tax)",
  agent: "var(--color-viz-bank)",
};

const ratio = (part: bigint, whole: bigint) =>
  whole > 0n ? Number((part * 10_000n) / whole) / 10_000 : 0;

/** A band from (0, y0..y0+t0) to (100, y1..y1+t1), drawn in a 100-wide stretched viewBox. */
const band = (y0: number, t0: number, y1: number, t1: number) =>
  `M0,${y0} C50,${y0} 50,${y1} 100,${y1} L100,${y1 + t1} C50,${y1 + t1} 50,${y0 + t0} 0,${y0 + t0} Z`;

function Tx({ sig, sample }: { sig?: string | null; sample?: boolean }) {
  if (!sig) return null;
  return sample ? (
    <span className="num text-micro text-n500" title={sig}>
      {sig.slice(0, 4)}…{sig.slice(-4)}
    </span>
  ) : (
    <span className="text-micro">
      <Address value={sig} kind="tx" />
    </span>
  );
}

/**
 * Where one action's money goes: issuer → escrow → each holder, the tax vault and the paying agent, with band
 * widths proportional to the amounts and every leg's transaction. "Step through" replays it leg by leg; the
 * default view is the final state, so nothing is ever hidden.
 */
export function MoneyFlow({
  currency,
  locale,
  issuer,
  escrow,
  recipients,
  state = "normal",
  title,
  example,
  sampleTx,
  className,
}: MoneyFlowProps) {
  const t = useTranslations("kit.money");
  const required = BigInt(escrow.required);
  const funded = BigInt(escrow.funded);
  const total = recipients.reduce((a, r) => a + BigInt(r.amount), 0n);
  const fundedShare = Math.min(1, ratio(funded, required || total));
  const paidTotal = recipients
    .filter((r) => r.status === "paid" || r.status === "agent")
    .reduce((a, r) => a + BigInt(r.amount), 0n);

  // Steps: funding first, then every leg that has moved (paid or with the agent), in the given order.
  const legs = recipients.filter(
    (r) => r.status === "paid" || r.status === "agent",
  );
  const steps = [
    ...(funded > 0n ? [{ id: "fund" as const, tx: escrow.fundTx }] : []),
    ...legs.map((r) => ({ id: r.id, tx: r.tx })),
  ];
  const [cursor, setCursor] = useState<number | null>(null); // null = final state
  const stepping = cursor !== null;
  const reached = (id: string) => {
    if (!stepping) return true;
    const i = steps.findIndex((s) => s.id === id);
    return i !== -1 && i <= cursor;
  };
  const isCurrent = (id: string) => stepping && steps[cursor]?.id === id;

  // Geometry (px in a stretched 100-wide viewBox).
  const n = Math.max(recipients.length, 1);
  const H = Math.max(n * ROW + (n - 1) * GAP, 140);
  const T = Math.min(H * 0.62, n * 44);
  const top = (H - T) / 2;
  let acc = top;
  const bands = recipients.map((r, i) => {
    const t0 = Math.max(3, T * ratio(BigInt(r.amount), total));
    const y0 = acc;
    acc += t0;
    const t1 = Math.min(t0, ROW - 24);
    const y1 = i * (ROW + GAP) + ROW / 2 - t1 / 2;
    return { r, d: band(y0, t0, y1, t1) };
  });
  const fundT = T * fundedShare;
  const shortT = T - fundT;

  const fundOn = reached("fund");
  const current = stepping ? steps[cursor] : undefined;
  const currentRecipient = recipients.find((r) => r.id === current?.id);

  const legStatus = (r: FlowRecipient) =>
    reached(r.id)
      ? r.status
      : r.status === "defaulted"
        ? "defaulted"
        : "pending";

  return (
    <section
      aria-label={title ?? t("title")}
      className={cx(
        "rounded-card border border-n200 bg-n0 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold">{title ?? t("title")}</h2>
          {example && <p className="text-xs text-n500">{t("example")}</p>}
        </div>
        <div className="text-right text-sm">
          <span className="text-n600">{t("total")} </span>
          <Amount
            minor={paidTotal.toString()}
            currency={currency}
            locale={locale}
            className="font-bold text-n900"
          />
        </div>
      </div>

      {/* phones: the issuer sits above the escrow */}
      <div className="mt-4 flex items-center gap-3 md:hidden">
        <div className="min-w-0 flex-1 rounded-btn border border-n200 bg-n50 px-3 py-2">
          <div className="text-xs text-n600">{t("issuer")}</div>
          <div className="truncate text-sm font-bold">{issuer.label}</div>
        </div>
        <div className="shrink-0 text-right text-xs">
          <div className="text-n500">{t("fundedLabel")}</div>
          <Amount
            minor={escrow.funded}
            currency={currency}
            locale={locale}
            className={cx("font-bold", fundOn ? "text-n900" : "text-n400")}
          />
        </div>
      </div>
      <div aria-hidden className="ml-10 h-4 w-0.5 bg-viz-escrow md:hidden" />

      <div
        className="grid grid-cols-[88px_32px_minmax(0,1fr)] md:mt-5 md:grid-cols-[140px_minmax(48px,1fr)_148px_minmax(56px,1.3fr)_minmax(220px,1.7fr)]"
        style={{ minHeight: H }}
      >
        {/* issuer (≥ 768 px) */}
        <div className="hidden self-center rounded-btn border border-n200 bg-n50 p-3 md:block">
          <div className="text-xs text-n600">{t("issuer")}</div>
          <div className="mt-0.5 text-sm font-bold break-words">
            {issuer.label}
          </div>
          {issuer.address && (
            <div className="mt-1 text-micro">
              <Address value={issuer.address} />
            </div>
          )}
        </div>

        {/* issuer → escrow band */}
        <div className="relative hidden md:block" style={{ height: H }}>
          <svg
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {fundT > 0 && (
              <path
                d={band(H / 2 - fundT / 2, fundT, top, fundT)}
                fill="var(--color-p500)"
                opacity={fundOn ? (isCurrent("fund") ? 0.7 : 0.4) : 0.12}
                className="transition-opacity duration-300"
              />
            )}
            {shortT > 0.5 && (
              <path
                d={band(H / 2 + fundT / 2, shortT, top + fundT, shortT)}
                fill={
                  state === "defaulted"
                    ? "var(--color-viz-short)"
                    : "var(--color-viz-pending)"
                }
                opacity={state === "defaulted" ? 0.35 : 0.5}
              />
            )}
          </svg>
          <span
            className="absolute inset-x-0 text-center text-micro font-bold text-n700"
            style={{ top: Math.max(0, top - 20) }}
          >
            <Amount minor={escrow.funded} currency={currency} locale={locale} />
          </span>
        </div>

        {/* escrow: the dark anchor of the picture */}
        <div
          className={cx(
            "flex flex-col justify-center rounded-btn bg-viz-escrow p-2.5 text-white md:p-3",
            isCurrent("fund") && "ring-2 ring-g400 ring-offset-2",
          )}
          style={{ height: H }}
        >
          <div className="text-xs text-p100">{t("escrow")}</div>
          <Amount
            minor={escrow.funded}
            currency={currency}
            locale={locale}
            className="mt-0.5 text-sm font-extrabold whitespace-normal md:text-base [&>span]:text-p100"
          />
          <div className="num mt-0.5 hidden text-xs text-p100 md:block">
            /{" "}
            <Amount
              minor={escrow.required}
              currency={currency}
              locale={locale}
              className="[&>span]:text-p100"
            />
          </div>
          {state === "defaulted" && required > funded && (
            <div className="mt-2 rounded-sm bg-default px-1.5 py-0.5 text-micro font-bold">
              {t("shortfall")}{" "}
              <Amount
                minor={(required - funded).toString()}
                currency={currency}
                locale={locale}
                className="whitespace-normal [&>span]:text-white"
              />
            </div>
          )}
          {state === "cured" && (
            <span className="mt-2 inline-flex w-fit rounded-full bg-cure-bg px-1.5 text-micro font-bold text-cure-fg">
              {t("cured")}
            </span>
          )}
          {escrow.address && (
            <div className="mt-2 hidden text-micro md:block [&_a]:text-g300 [&_a]:decoration-g400 [&_button]:text-p100">
              <Address value={escrow.address} />
            </div>
          )}
        </div>

        {/* escrow → recipients bands */}
        <div className="relative" style={{ height: H }}>
          <svg
            viewBox={`0 0 100 ${H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
            aria-hidden
          >
            {bands.map(({ r, d }) => {
              const s = legStatus(r);
              const moved = s === "paid" || s === "agent";
              return (
                <path
                  key={r.id}
                  d={d}
                  fill={
                    s === "defaulted"
                      ? "var(--color-viz-short)"
                      : moved
                        ? FILL[r.kind]
                        : "var(--color-viz-pending)"
                  }
                  opacity={
                    !moved ? 0.45 : stepping && !isCurrent(r.id) ? 0.45 : 0.9
                  }
                  className="transition-opacity duration-300"
                />
              );
            })}
          </svg>
        </div>

        {/* recipients */}
        <ul className="flex flex-col" style={{ gap: GAP }}>
          {recipients.map((r) => {
            const s = legStatus(r);
            return (
              <li
                key={r.id}
                className={cx(
                  "grid grid-cols-[4px_minmax(0,1fr)] items-center gap-x-2.5 rounded-btn border px-2.5",
                  isCurrent(r.id)
                    ? "border-g400 ring-2 ring-g400/40"
                    : "border-n200",
                  r.kind === "agent" && "qp-hatch",
                )}
                style={{ height: ROW }}
              >
                <span
                  aria-hidden
                  className="h-9 rounded-full"
                  style={{
                    background:
                      s === "paid" || s === "agent"
                        ? FILL[r.kind]
                        : s === "defaulted"
                          ? "var(--color-viz-short)"
                          : "var(--color-viz-pending)",
                  }}
                />
                <div className={cx("min-w-0", r.kind === "agent" ? "space-y-px" : "space-y-0.5")}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className="min-w-0 truncate text-sm font-bold text-n900"
                      title={r.label}
                    >
                      {r.kind === "tax"
                        ? t("taxVault")
                        : r.kind === "agent"
                          ? t("agent")
                          : r.label}
                    </span>
                    <Amount
                      minor={r.amount}
                      currency={currency}
                      locale={locale}
                      className={cx(
                        "shrink-0 text-sm font-bold",
                        s === "paid" || s === "agent"
                          ? "text-n900"
                          : "text-n500",
                      )}
                    />
                  </div>
                  {/* the agent leg: who it pays for on its own line, then the simulated bank leg and the
                      on-chain transaction that paid the agent */}
                  {r.kind === "agent" && (
                    <div className="truncate text-xs text-n500" title={t("agentSub", { who: r.label })}>
                      {t("agentSub", { who: r.label })}
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2">
                    {r.kind === "agent" ? (
                      <ProvenanceChip kind="simulated" className="h-5" />
                    ) : (
                      <span className="min-w-0 truncate text-xs text-n500">
                        {r.kind === "tax" ? t("taxSub") : r.sub}
                      </span>
                    )}
                    {/* the agent line shares its width with the chip: the link may shorten, never overflow */}
                    <span className={r.kind === "agent" ? "min-w-0" : "shrink-0"}>
                      {(s === "paid" || s === "agent") && r.tx ? (
                        <Tx sig={r.tx} sample={sampleTx} />
                      ) : r.kind === "agent" ? null : (
                        <span
                          className={cx(
                            "text-micro font-bold",
                            s === "defaulted" ? "text-default" : "text-n500",
                          )}
                        >
                          {t(`status.${s}`)}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* step-through: replays the legs in order, each with its transaction */}
      {steps.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-n100 pt-3">
          {!stepping ? (
            <Button size="sm" variant="secondary" onClick={() => setCursor(0)}>
              {t("stepThrough")}
            </Button>
          ) : (
            <>
              <Button
                size="sm"
                variant="secondary"
                disabled={cursor === 0}
                onClick={() => setCursor(Math.max(0, cursor - 1))}
              >
                {t("back")}
              </Button>
              <Button
                size="sm"
                disabled={cursor >= steps.length - 1}
                onClick={() =>
                  setCursor(Math.min(steps.length - 1, cursor + 1))
                }
              >
                {t("next")}
              </Button>
              <p
                className="min-w-0 flex-1 basis-56 text-sm text-n700"
                aria-live="polite"
              >
                <span className="num font-semibold text-n900">
                  {t("step", { n: cursor + 1, total: steps.length })}
                </span>{" "}
                {current?.id === "fund"
                  ? t("stepFund")
                  : currentRecipient?.kind === "tax"
                    ? t("stepTax")
                    : currentRecipient?.kind === "agent"
                      ? t("stepAgent", { who: currentRecipient.label })
                      : t("stepPay", { who: currentRecipient?.label ?? "" })}
                {" · "}
                <Amount
                  minor={
                    current?.id === "fund"
                      ? escrow.funded
                      : (currentRecipient?.amount ?? "0")
                  }
                  currency={currency}
                  locale={locale}
                  className="font-semibold"
                />{" "}
                <Tx sig={current?.tx} sample={sampleTx} />
              </p>
              <button
                type="button"
                onClick={() => setCursor(null)}
                className="rounded-sm px-1 text-sm font-semibold text-g700 underline underline-offset-2"
              >
                {t("showAll")}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
