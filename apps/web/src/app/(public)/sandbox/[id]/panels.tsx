"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { useWalletWrite } from "@/app/(cabinet)/investor/_lib/useWalletWrite";
import { Address } from "@/components/ui/Address";
import { type Actor, ActorChip } from "@/components/ui/ActorChip";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { useWalletUX } from "@/components/wallet/WalletUX";
import { type Locale } from "@/i18n/locale";
import type { ActivityLike } from "@/lib/api";
import { bpsToPercent, formatDate } from "@/lib/format";
import { buildClaimIx } from "@/lib/portal";
import {
  addDays,
  bondDate,
  type Sandbox,
  type SandboxAction,
  type SandboxEntitlement,
  SCENARIOS,
  type ScenarioKind,
} from "@/lib/sandbox";
import { formatAmount } from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";
import { portalRpc, signAndSendWithWallet, walletTransactionSigner } from "@/lib/walletSigner";

export type Role = "anyone" | "issuer" | "registrar" | "investor";

const CARD = "rounded-card border border-n200 bg-n0 p-4 sm:p-5";
const CUR = "tKZT";

/** A one-second tick that starts after hydration (the first render uses the server's time: no drift). */
function useTick(serverTime: number, skew: number) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now() + skew);
    const id = setInterval(() => setNow(Date.now() + skew), 1000);
    return () => clearInterval(id);
  }, [skew]);
  return now ?? serverTime;
}

/** Segmented control: one row of buttons, the chosen one filled. */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="min-w-0">
      <span className="text-xs font-semibold text-n600">{label}</span>
      <div role="group" aria-label={label} className="mt-1.5 grid grid-cols-2 gap-0.5 rounded-btn border border-n200 bg-n50 p-0.5 min-[420px]:grid-cols-4 lg:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={cx(
              "h-8 rounded-sm px-2 text-xs font-bold transition-colors",
              value === o.value ? "bg-p900 text-white" : "text-n700 hover:bg-n0 hover:text-n900",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------- the bond's calendar ----------

/** The demo clock made visible: the bond's own date running a day per `daySecs`, and how far its life has come. */
export function ClockCard({ s, skew, locale }: { s: Sandbox; skew: number; locale: Locale }) {
  const t = useTranslations("sandbox.calendar");
  const now = useTick(s.serverTime, skew);
  const maturity = s.schedule.at(-1);
  const total = maturity ? bondDate(s.series.issueDate, s.clock, Date.parse(maturity.paymentDate)).day : 365;
  const { day, date } = bondDate(s.series.issueDate, s.clock, now);
  const shown = Math.min(day, total);
  const share = total > 0 ? shown / total : 0;
  const at = (ymd: string) => formatDate(`${ymd}T00:00:00+05:00`, locale);
  return (
    <section aria-label={t("title")} className="rounded-card border border-demo-bd bg-n0 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-n600">{t("title")}</span>
        <span className="inline-flex h-6 items-center gap-1 rounded-full border border-demo-bd bg-demo-bg px-2 text-micro font-bold text-demo-fg">
          <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0" />
          </svg>
          {t("rate", { s: s.clock.daySecs })}
        </span>
      </div>
      <div className="num mt-2 text-title font-extrabold tracking-tight text-n900" aria-live="off">
        {at(addDays(s.series.issueDate, shown))}
      </div>
      <div className="num mt-0.5 text-sm text-n600">{t("day", { day: shown, total })}</div>
      <div className="relative mt-4 h-2 rounded-full bg-n100" aria-hidden>
        <div className="qp-bar absolute inset-0 rounded-full bg-demo-fg" style={{ scale: `${share} 1` }} />
        {s.schedule.map((it) => {
          const d = bondDate(s.series.issueDate, s.clock, Date.parse(it.paymentDate)).day;
          return (
            <span
              key={it.couponNumber}
              className={cx("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-n0", d <= shown ? "bg-demo-fg" : "bg-n300")}
              style={{ left: `${Math.min(100, (d / Math.max(total, 1)) * 100)}%` }}
            />
          );
        })}
      </div>
      <div className="num mt-2 flex justify-between gap-2 text-micro text-n500">
        <span>{at(s.series.issueDate)}</span>
        <span>{date && maturity ? at(addDays(s.series.issueDate, total)) : ""}</span>
      </div>
    </section>
  );
}

// ---------- scenarios ----------

const TILE: Record<ScenarioKind, string> = {
  skip_funding: "bg-err-bg text-default",
  cure: "bg-cure-bg text-cure-fg",
  non_kyc_transfer: "bg-n100 text-n800",
  dvp_trade: "bg-bank-bg text-bank-fg",
};
const GLYPH: Record<ScenarioKind, string> = {
  skip_funding: "M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z",
  cure: "M20 6 9 17l-5-5",
  non_kyc_transfer: "M12 3 4 6v6c0 4.4 3.4 8.3 8 9 4.6-.7 8-4.6 8-9V6l-8-3ZM9 12h6",
  dvp_trade: "M7 7h11l-3-3M17 17H6l3 3",
};

function Tx({ sig, label }: { sig: string; label?: string }) {
  return (
    <span className="text-xs">
      <Address value={sig} kind="tx" label={label} />
    </span>
  );
}

/** The four things a judge can do to the bond, each with what it does on-chain and, once run, what happened. */
export function Scenarios({
  s,
  a,
  busy,
  error,
  onRun,
  locale,
}: {
  s: Sandbox;
  a: SandboxAction | null;
  busy: ScenarioKind | null;
  error: { kind: ScenarioKind; text: string } | null;
  onRun: (kind: ScenarioKind) => void;
  locale: Locale;
}) {
  const t = useTranslations("sandbox.try");
  const money = (minor: string | bigint) => formatAmount(minor, 2, locale);
  const closed = s.series.status === "Closed";
  const lastFunded = a?.kind === "REDM" && ["Funded", "Settling", "Completed"].includes(a.status);
  const why: Record<ScenarioKind, string | null> = {
    skip_funding: closed ? t("why.closed") : !s.autofund ? t("why.skipped") : lastFunded ? t("why.nothingToFund") : null,
    cure: a?.status === "Defaulted" ? null : t("why.noDefault"),
    non_kyc_transfer: closed ? t("why.closed") : null,
    dvp_trade: closed ? t("why.closed") : null,
  };
  const defaultEv = s.activity.find((e) => e.kind === "ActionDefaulted");

  const result = (kind: ScenarioKind): ReactNode => {
    const r = s.scenarios.find((x) => x.kind === kind);
    if (!r) return null;
    const sigs = r.signatures;
    switch (kind) {
      case "skip_funding":
        return defaultEv ? (
          <>
            {t("result.defaulted", { amount: money(String(defaultEv.payload?.shortfall ?? "0")) })} <Tx sig={defaultEv.sig} />
          </>
        ) : (
          t("result.skipped")
        );
      case "cure":
        return (
          <>
            {t("result.cured")} {sigs[0] && <Tx sig={sigs[0]} />}
          </>
        );
      case "non_kyc_transfer":
        return (
          <>
            {t("result.refused", { error: r.error ?? "refused" })} {sigs[0] && <Tx sig={sigs[0]} />}
            {r.logs?.length ? (
              <details className="mt-1.5">
                <summary className="cursor-pointer text-xs font-semibold text-n600">{t("logs")}</summary>
                <pre className="mt-1 max-h-40 overflow-auto rounded-sm bg-n50 p-2 font-mono text-[11px] leading-4 whitespace-pre-wrap text-n700">
                  {r.logs.join("\n")}
                </pre>
              </details>
            ) : null}
          </>
        );
      default: {
        const tr = r.trade;
        if (!tr) return null;
        return (
          <>
            {t("result.traded", { units: tr.units, cash: money(tr.cash.minor), clean: money(tr.clean.minor), accrued: money(tr.accrued.minor), days: tr.accruedDays })}
            {BigInt(tr.accrued.minor) < 0n && <> {t("result.exCoupon")}</>} {sigs.at(-1) && <Tx sig={sigs.at(-1)!} />}
          </>
        );
      }
    }
  };

  return (
    // each card spans three subgrid rows (text, button, result): buttons line up in every language, and a result
    // adds height below the buttons only
    <div className="mt-3 grid gap-x-3 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
      {SCENARIOS.map((kind) => {
        const res = result(kind);
        const off = why[kind];
        const err = error?.kind === kind ? error.text : null;
        return (
          <article key={kind} data-scenario={kind} className="row-span-3 grid min-w-0 grid-rows-subgrid gap-y-0 rounded-card border border-n200 bg-n0 p-4">
            <div className="flex items-start gap-3">
              <span aria-hidden className={cx("grid size-9 shrink-0 place-items-center rounded-btn", TILE[kind])}>
                <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
                  <path d={GLYPH[kind]} />
                </svg>
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-n900">{t(`${kind}.title`)}</h3>
                <p className="mt-0.5 text-sm text-n600">
                  {t.rich(`${kind}.what`, {
                    term: (c) => (
                      <GlossaryTerm term={kind === "dvp_trade" ? "accrued" : kind === "non_kyc_transfer" ? "transferHook" : kind === "cure" ? "cure" : "default"}>
                        {c}
                      </GlossaryTerm>
                    ),
                  })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1 pt-3">
              <Button size="sm" variant={kind === "cure" && !off ? "primary" : "secondary"} disabled={!!off} loading={busy === kind} onClick={() => onRun(kind)}>
                {t(`${kind}.button`)}
              </Button>
              {off && <span className="text-xs text-n500">{off}</span>}
            </div>
            {res || err ? (
              <div
                role="status"
                className={cx(
                  "mt-3 rounded-btn border px-3 py-2 text-sm",
                  err ? "border-err-bd bg-err-bg text-err-fg" : kind === "non_kyc_transfer" ? "border-n200 bg-n50 text-n800" : "border-g200 bg-g50 text-n800",
                )}
              >
                {err ?? res}
              </div>
            ) : (
              <span />
            )}
          </article>
        );
      })}
    </div>
  );
}

// ---------- the register at the record date ----------

function Pill({ tone, children }: { tone: "neutral" | "paid" | "bank" | "default" | "claim" | "waiting"; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center rounded-full border px-2 text-micro font-bold whitespace-nowrap",
        tone === "paid" && "border-g200 bg-g50 text-g700",
        tone === "bank" && "border-bank-bd bg-bank-bg text-bank-fg",
        tone === "default" && "border-default bg-default text-white",
        tone === "claim" && "border-g600 bg-n0 text-g700",
        tone === "neutral" && "border-n200 bg-n50 text-n700",
        tone === "waiting" && "border-dashed border-n300 bg-n0 text-n600",
      )}
    >
      {children}
    </span>
  );
}

const txOf = (activity: ActivityLike[], pda: string, owner: string, kinds: string[]) =>
  activity.find((e) => e.actionPda === pda && kinds.includes(e.kind) && e.payload?.owner === owner)?.sig;

/** Entitlements of the live action: empty until the record date, then one row per holder as the snapshot runs. */
export function Register({
  s,
  a,
  locale,
  name,
}: {
  s: Sandbox;
  a: SandboxAction | null;
  locale: Locale;
  name: (owner: string) => string;
}) {
  const t = useTranslations("sandbox.register");
  const redm = a?.kind === "REDM";
  const snapshotting = a?.status === "RecordStruck";
  const rows = s.entitlements;
  const waiting = snapshotting
    ? s.holders.filter((h) => h.units !== "0" && !rows.some((e) => e.owner === h.owner))
    : [];
  const units = rows.reduce((x, e) => x + BigInt(e.units), 0n);
  const supply = BigInt(s.series.totalIssued);
  const sum = (f: "gross" | "tax" | "net" | "principal") => rows.reduce((x, e) => x + BigInt(e[f]?.minor ?? "0"), 0n);
  const amt = (minor: string | bigint, strong = false) => (
    <Amount minor={minor.toString()} currency={CUR} locale={locale} className={strong ? "font-bold text-n900" : "text-n800"} />
  );
  const status = (e: SandboxEntitlement) => {
    if (e.status === "PaidToAgent") return <Pill tone="bank">{t("status.agent")}</Pill>;
    if (e.status === "Paid" || e.status === "Retired") return <Pill tone="paid">{redm ? t("status.burned") : t("status.paid")}</Pill>;
    if (a?.status === "Defaulted") return <Pill tone="default">{t("status.defaulted")}</Pill>;
    if (e.owner === s.wallet && (a?.status === "Funded" || a?.status === "Settling")) return <Pill tone="claim">{t("status.claim")}</Pill>;
    return <Pill tone="neutral">{t("status.owed")}</Pill>;
  };
  const tx = (e: SandboxEntitlement) =>
    (a && (txOf(s.activity, a.pda, e.owner, ["EntitlementPaid", "PaidToAgent"]) ?? txOf(s.activity, a.pda, e.owner, ["HolderSnapshotted"]))) || null;
  const who = (owner: string) => {
    const h = s.holders.find((x) => x.owner === owner);
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-n900">{name(owner)}</span>
          {h?.kind === "wallet" && <Pill tone="claim">{t("you")}</Pill>}
          {h?.route === "bank" && <Pill tone="bank">{t("bankRoute")}</Pill>}
        </div>
        <div className="num text-xs text-n500">
          {owner.slice(0, 4)}…{owner.slice(-4)}
          {h && h.taxRateBps > 0 && ` · ${t("taxRate", { rate: bpsToPercent(h.taxRateBps, locale) })}`}
        </div>
      </div>
    );
  };

  return (
    <section aria-labelledby="sbx-register" className={CARD}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="sbx-register" className="text-base font-bold">
          {t("title")}
        </h2>
        {a && rows.length > 0 && (
          <span className={cx("text-xs font-bold", units === supply || !snapshotting ? "text-g700" : "text-n600")}>
            {snapshotting ? t("progress", { done: rows.length, count: rows.length + waiting.length }) : t("complete", { units: units.toString() })}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-[62ch] text-sm text-n600">
        {t.rich("lead", {
          rd: (c) => <GlossaryTerm term="recordDate">{c}</GlossaryTerm>,
          ent: (c) => <GlossaryTerm term="entitlement">{c}</GlossaryTerm>,
        })}
      </p>
      {!a || a.status === "Announced" ? (
        <p className="mt-4 rounded-btn border border-dashed border-n300 px-4 py-6 text-center text-sm text-n600">{t("empty")}</p>
      ) : (
        <>
          {/* desktop: a table; phones: one card per holder */}
          <div className="mt-4 hidden md:block">
            <table className="w-full text-dense">
              <thead>
                <tr className="border-b border-n200 text-left text-xs text-n500">
                  <th className="py-2 pr-3 font-semibold">{t("col.holder")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("col.units")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("col.gross")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{t("col.tax")}</th>
                  <th className="py-2 pr-3 text-right font-semibold">{redm ? t("col.netPrincipal") : t("col.net")}</th>
                  <th className="py-2 pr-3 font-semibold">{t("col.status")}</th>
                  <th className="py-2 font-semibold">{t("col.tx")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => {
                  const sig = tx(e);
                  return (
                    <tr key={e.owner} className="h-12 border-b border-n100 align-middle">
                      <td className="py-2 pr-3">{who(e.owner)}</td>
                      <td className="num py-2 pr-3 text-right font-semibold">{e.units}</td>
                      <td className="py-2 pr-3 text-right">{amt(e.gross?.minor ?? "0")}</td>
                      <td className="py-2 pr-3 text-right">{amt(e.tax?.minor ?? "0")}</td>
                      <td className="py-2 pr-3 text-right">{amt(BigInt(e.net?.minor ?? "0") + BigInt(e.principal?.minor ?? "0"), true)}</td>
                      <td className="py-2 pr-3">{status(e)}</td>
                      <td className="py-2">{sig && <Tx sig={sig} />}</td>
                    </tr>
                  );
                })}
                {waiting.map((h) => (
                  <tr key={h.owner} className="h-12 border-b border-dashed border-n200 text-n500">
                    <td className="py-2 pr-3">{who(h.owner)}</td>
                    <td className="num py-2 pr-3 text-right">{h.units}</td>
                    <td colSpan={4} className="py-2 pr-3 text-right">
                      <Pill tone="waiting">{t("status.waiting")}</Pill>
                    </td>
                    <td />
                  </tr>
                ))}
              </tbody>
              {!snapshotting && (
                <tfoot>
                  <tr className="text-dense">
                    <td className="py-2.5 pr-3 font-semibold text-n700">{t("total")}</td>
                    <td className="num py-2.5 pr-3 text-right font-bold">{units.toString()}</td>
                    <td className="py-2.5 pr-3 text-right">{amt(sum("gross"), true)}</td>
                    <td className="py-2.5 pr-3 text-right">{amt(sum("tax"), true)}</td>
                    <td className="py-2.5 pr-3 text-right">{amt(sum("net") + sum("principal"), true)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <ul className="mt-4 space-y-2 md:hidden">
            {rows.map((e) => {
              const sig = tx(e);
              return (
                <li key={e.owner} className="rounded-btn border border-n200 p-3">
                  <div className="flex items-start justify-between gap-2">
                    {who(e.owner)}
                    {status(e)}
                  </div>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                    <dt className="text-n500">{t("col.units")}</dt>
                    <dd className="num text-right font-semibold">{e.units}</dd>
                    <dt className="text-n500">{t("col.gross")}</dt>
                    <dd className="text-right">{amt(e.gross?.minor ?? "0")}</dd>
                    <dt className="text-n500">{t("col.tax")}</dt>
                    <dd className="text-right">{amt(e.tax?.minor ?? "0")}</dd>
                    <dt className="text-n500">{redm ? t("col.netPrincipal") : t("col.net")}</dt>
                    <dd className="text-right">{amt(BigInt(e.net?.minor ?? "0") + BigInt(e.principal?.minor ?? "0"), true)}</dd>
                  </dl>
                  {sig && <div className="mt-2">{<Tx sig={sig} />}</div>}
                </li>
              );
            })}
            {waiting.map((h) => (
              <li key={h.owner} className="flex items-center justify-between gap-2 rounded-btn border border-dashed border-n300 p-3">
                {who(h.owner)}
                <Pill tone="waiting">{t("status.waiting")}</Pill>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

// ---------- role lens ----------

/** Claim with the visitor's own wallet (included with POST {wallet}): pay_batch for its entitlement, wallet-signed. */
export function useClaim(s: Sandbox, a: SandboxAction | null) {
  const t = useTranslations("sandbox.claim");
  const { wallet, publicKey } = useWallet();
  const { connect } = useWalletUX();
  const runWalletWrite = useWalletWrite();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const mine = s.wallet ? s.entitlements.find((e) => e.owner === s.wallet) : undefined;
  const claimable = !!a && !!mine && mine.status === "Snapshotted" && (a.status === "Funded" || a.status === "Settling") && !sent;
  const amount = mine ? formatAmount(BigInt(mine.net?.minor ?? "0") + BigInt(mine.principal?.minor ?? "0"), 2, "en") : "0";
  const connected = publicKey?.toBase58();

  const claim = async () => {
    if (!a || !s.wallet || !wallet || !("signTransaction" in wallet.adapter)) return;
    setBusy(true);
    const signer = walletTransactionSigner(wallet.adapter, address(s.wallet));
    const res = await runWalletWrite({
      pending: t("pending"),
      success: () => t("done"),
      call: async () => signAndSendWithWallet(signer, portalRpc(), await buildClaimIx(portalRpc(), s.series.mint, address(a.pda), signer)),
    });
    if (res) setSent(res.signature);
    setBusy(false);
  };

  const button: ReactNode = !claimable ? undefined : connected === s.wallet ? (
    <Button loading={busy} onClick={claim}>
      {t("button", { amount })}
    </Button>
  ) : (
    <Button variant="secondary" onClick={connect}>
      {t("connect")}
    </Button>
  );
  return { mine, claimable, button, sent };
}

/** "Use my wallet": a fresh sandbox with the connected wallet as a fourth holder (POST /demo/sandbox {wallet}). */
function UseMyWallet() {
  const t = useTranslations("sandbox.role.investor");
  const { publicKey } = useWallet();
  const { connect } = useWalletUX();
  const router = useRouter();
  const [asked, setAsked] = useState(false);
  const key = publicKey?.toBase58();
  useEffect(() => {
    if (asked && key) router.push(`/sandbox/new?fresh=1&wallet=${key}`);
  }, [asked, key, router]);
  return (
    <div className="mt-4 rounded-btn border border-dashed border-n300 p-3">
      <p className="text-sm text-n700">{t("walletLead")}</p>
      <Button
        size="sm"
        variant="secondary"
        className="mt-2"
        onClick={() => {
          setAsked(true);
          if (!key) connect();
        }}
      >
        {key ? t("walletUse", { short: `${key.slice(0, 4)}…${key.slice(-4)}` }) : t("walletConnect")}
      </Button>
    </div>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-n100 py-2 text-sm last:border-0">
      <span className="text-n600">{k}</span>
      <span className="min-w-0 text-right font-semibold text-n900">{children}</span>
    </div>
  );
}

/** What the chosen role sees and may do right now. */
export function RoleCard({
  role,
  s,
  a,
  locale,
  claim,
  name,
  onCure,
  busy,
}: {
  role: Role;
  s: Sandbox;
  a: SandboxAction | null;
  locale: Locale;
  claim: ReturnType<typeof useClaim>;
  name: (owner: string) => string;
  onCure: () => void;
  busy: ScenarioKind | null;
}) {
  const t = useTranslations("sandbox.role");
  const tstep = useTranslations("steps.do");
  const [pick, setPick] = useState<string | null>(null);
  const amt = (minor: string | bigint) => <Amount minor={minor.toString()} currency={CUR} locale={locale} />;
  const actionN = a ? (a.kind === "REDM" ? t("maturity") : t("coupon", { n: s.actions.indexOf(a) + 1 })) : "";
  const required = a ? BigInt(a.totalGross?.minor ?? "0") + BigInt(a.perUnitPrincipal.minor) * BigInt(a.unitsSnapshotted ?? "0") : 0n;
  const funded = s.activity.filter((e) => e.kind === "ActionFunded" && e.actionPda === a?.pda);
  const bondDay = (iso: string) => formatDate(`${bondDate(s.series.issueDate, s.clock, Date.parse(iso)).date}T00:00:00+05:00`, locale);
  const next = s.next;

  let body: ReactNode;
  if (role === "anyone") {
    const step = next.step && next.step !== "announce" && next.actor === "anyone" ? next.step : null;
    body = (
      <>
        <p className="text-sm text-n700">{t.rich("anyone.body", { term: (c) => <GlossaryTerm term="permissionless">{c}</GlossaryTerm> })}</p>
        <div className="mt-3 rounded-btn bg-n50 p-3">
          <div className="text-xs font-semibold text-n600">{t("anyone.next")}</div>
          {step ? (
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="font-bold text-n900">{step === "declare_default" ? t("anyone.declare") : tstep(step)}</span>
              <ActorChip actor="anyone" long />
            </div>
          ) : (
            <div className="mt-1 text-sm text-n700">{t("anyone.none")}</div>
          )}
          {step && next.at && next.at > s.serverTime && (
            <div className="mt-1 text-sm">
              <CountdownClock to={next.at - (s.serverTime - Date.now())} daySecs={s.clock.daySecs} />
            </div>
          )}
        </div>
      </>
    );
  } else if (role === "issuer") {
    body = (
      <>
        <p className="text-sm text-n700">{t("issuer.body")}</p>
        {a && a.status !== "Announced" && a.status !== "RecordStruck" ? (
          <div className="mt-3">
            <Row k={t("issuer.owe", { action: actionN })}>{amt(required)}</Row>
            <Row k={t("issuer.due")}>{bondDay(a.paymentAt)}</Row>
            <Row k={t("issuer.funded")}>
              {funded.length ? (
                <span className="inline-flex items-center gap-2">
                  {amt(funded.reduce((x, e) => x + BigInt(String(e.payload?.amount ?? "0")), 0n))}
                  <Tx sig={funded[0]!.sig} />
                </span>
              ) : (
                amt(0n)
              )}
            </Row>
            {a.status === "Defaulted" ? (
              <Button className="mt-3" block loading={busy === "cure"} onClick={onCure}>
                {t("issuer.cure")}
              </Button>
            ) : (
              <p className={cx("mt-3 text-sm", s.autofund ? "text-n600" : "font-semibold text-default")}>
                {funded.length ? (a.curedAt ? t("issuer.cured") : t("issuer.paidIn")) : s.autofund ? t("issuer.auto") : t("issuer.skipped")}
              </p>
            )}
          </div>
        ) : (
          <p className="mt-3 text-sm text-n600">{a ? t("issuer.before", { action: actionN }) : t("issuer.none")}</p>
        )}
      </>
    );
  } else if (role === "registrar") {
    const bank = s.entitlements.filter((e) => e.status === "PaidToAgent");
    body = (
      <>
        <p className="text-sm text-n700">{t.rich("registrar.body", { term: (c) => <GlossaryTerm term="transferHook">{c}</GlossaryTerm> })}</p>
        <div className="mt-3">
          <Row k={t("registrar.investors")}>{s.holders.length}</Row>
          <Row k={t("registrar.supply")}>{s.series.totalIssued}</Row>
          <Row k={t("registrar.bank")}>{bank.length ? bank.map((e) => name(e.owner)).join(", ") : "0"}</Row>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <ProvenanceChip kind="onchain">{t("registrar.sas")}</ProvenanceChip>
          <ProvenanceChip kind="simulated">{t("registrar.kyc")}</ProvenanceChip>
          {bank.length > 0 && <ProvenanceChip kind="simulated">{t("registrar.bankTransfer")}</ProvenanceChip>}
        </div>
      </>
    );
  } else {
    const holders = s.holders;
    const sel = holders.find((h) => h.owner === pick) ?? holders.find((h) => h.kind === "wallet") ?? holders[0]!;
    const e = s.entitlements.find((x) => x.owner === sel.owner);
    const paidSig = a && e ? txOf(s.activity, a.pda, e.owner, ["EntitlementPaid", "PaidToAgent"]) : undefined;
    body = (
      <>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("investor.pick")}>
          {holders.map((h) => (
            <button
              key={h.owner}
              type="button"
              aria-pressed={h.owner === sel.owner}
              onClick={() => setPick(h.owner)}
              className={cx(
                "h-7 rounded-full border px-2.5 text-xs font-bold",
                h.owner === sel.owner ? "border-p900 bg-p900 text-white" : "border-n200 bg-n0 text-n700 hover:border-n400",
              )}
            >
              {h.label}
            </button>
          ))}
        </div>
        <div className="mt-3">
          <Row k={t("investor.units")}>{sel.units}</Row>
          <Row k={t("investor.route")}>
            {sel.route === "bank" ? (
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                {t("investor.bank")} <ProvenanceChip kind="simulated">{t("investor.bankSim")}</ProvenanceChip>
              </span>
            ) : (
              t("investor.wallet")
            )}
          </Row>
          {e ? (
            <>
              <Row k={t("investor.gross", { action: actionN })}>{amt(e.gross?.minor ?? "0")}</Row>
              <Row k={t("investor.tax")}>{amt(e.tax?.minor ?? "0")}</Row>
              <Row k={t("investor.net")}>{amt(BigInt(e.net?.minor ?? "0") + BigInt(e.principal?.minor ?? "0"))}</Row>
              <Row k={t("investor.status")}>
                {paidSig ? <Tx sig={paidSig} label={e.status === "PaidToAgent" ? t("investor.withAgent") : t("investor.paid")} /> : a?.status === "Defaulted" ? t("investor.defaulted") : t("investor.owed")}
              </Row>
            </>
          ) : (
            <p className="mt-2 text-sm text-n600">{a ? t("investor.noSnapshot", { action: actionN }) : t("investor.none")}</p>
          )}
        </div>
        {sel.kind === "wallet" && claim.button && <div className="mt-3">{claim.button}</div>}
        {sel.kind === "wallet" && claim.sent && (
          <p className="mt-2 text-sm text-g700">
            {t("investor.claimed")} <Tx sig={claim.sent} />
          </p>
        )}
        {!s.wallet && <UseMyWallet />}
      </>
    );
  }

  return (
    <div className="mt-4">
      <h3 className="text-base font-bold text-n900">{t(`${role}.title`)}</h3>
      <div className="mt-1.5">{body}</div>
    </div>
  );
}

// ---------- transactions ----------

/** One sentence per indexed event (and per refused transfer), newest first, each with its devnet transaction. */
export function Feed({
  s,
  skew,
  name,
  actionName,
  locale,
}: {
  s: Sandbox;
  skew: number;
  name: (owner: string) => string;
  actionName: (pda: string | null | undefined) => string;
  locale: Locale;
}) {
  const t = useTranslations("sandbox.feed");
  const tx = useTranslations("sandbox.tx");
  const now = useTick(s.serverTime, skew);
  const [all, setAll] = useState(false);
  const money = (v: unknown) => formatAmount(String(v ?? "0"), 2, locale);
  const label = (e: ActivityLike): string => {
    const p = e.payload ?? {};
    const v: Record<string, string> = {
      who: name(String(p.owner ?? "")),
      units: String(p.units ?? p.units_snapshotted ?? ""),
      action: actionName(e.actionPda ?? e.action_pda),
      amount: money(p.paid ?? p.amount ?? p.shortfall ?? p.net),
      ticker: String(p.ticker ?? s.series.ticker),
      seller: name(String(p.seller ?? "")),
      buyer: name(String(p.buyer ?? "")),
      cash: money(p.cash_amount),
      accrued: money(p.accrued),
    };
    return tx.has(e.kind) ? tx(e.kind, v) : e.kind;
  };
  const refused = s.scenarios
    .filter((x) => x.kind === "non_kyc_transfer" && x.signatures[0])
    .map((x) => ({ key: x.signatures[0]!, text: tx("refused", { error: x.error ?? "" }), sig: x.signatures[0]!, at: x.at, failed: true, actor: "anyone" as Actor }));
  const rows = [
    ...s.activity.map((e) => ({ key: `${e.id}:${e.sig}`, text: label(e), sig: e.sig, at: e.ts * 1000, failed: false })),
    ...refused,
  ].sort((x, y) => y.at - x.at);
  const shown = all ? rows : rows.slice(0, 14);
  const ago = (at: number) => {
    const sec = Math.max(0, Math.round((now - at) / 1000));
    return sec >= 60 ? t("agoMin", { m: Math.floor(sec / 60) }) : t("ago", { s: sec });
  };
  return (
    <section aria-labelledby="sbx-feed" className={CARD}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="sbx-feed" className="text-base font-bold">
          {t("title")}
        </h2>
        <span className="num text-xs text-n500">{t("count", { n: rows.length })}</span>
      </div>
      <p className="text-xs text-n600">{t("lead")}</p>
      <ol className="mt-3 divide-y divide-n100">
        {shown.map((row) => (
          <li key={row.key} className="py-2.5 text-sm">
            <div className={cx("font-semibold", row.failed ? "text-err-fg" : "text-n900")}>{row.text}</div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-n500">
              <Tx sig={row.sig} />
              <span className="num shrink-0">{ago(row.at)}</span>
            </div>
          </li>
        ))}
      </ol>
      {rows.length > shown.length && (
        <Button size="sm" variant="ghost" className="mt-1" onClick={() => setAll(true)}>
          {t("all", { n: rows.length })}
        </Button>
      )}
    </section>
  );
}
