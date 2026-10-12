"use client";

import { answeredByRpc, createProofRpc } from "@/lib/proof/endpoints";
import { QUPON_BONDS_PROGRAM_ADDRESS } from "@qupon/client/src/generated";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { ScopeGrid } from "@/app/(public)/_landing/sections";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { type Locale, toLocale } from "@/i18n/locale";
import { bpsToPercent, formatDateTime, shortKey } from "@/lib/format";
import { loadProof } from "@/lib/proof/chain";
import type { ChainTx } from "@/lib/proof/chain";
import {
  ACTION_STATUS,
  type ActionReport,
  type Check,
  type HolderRow,
  type ProofReport,
  hex,
  verifyProof,
} from "@/lib/proof/verify";
import { formatAmount, formatMoney } from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";

/** Devnet cash assets (config/devnet.json cashAssets): the tenge stand-ins print ₸. */
const CASH_SIGN: Record<string, string> = {
  HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF: "₸",
  "7H3MbktQifAeYqKS44ar9ck1c4kQZ3Sgj36bmQzm2atq": "₸",
  WsSWxpZXuuDcBmymLitFpvfEWWebiBUXBRNQRFBT29k: "₸",
  "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU": "USDC",
};

type State =
  | { phase: "loading"; report?: undefined }
  | { phase: "ready"; report: ProofReport }
  | {
      phase: "missing" | "error";
      report?: undefined;
      message?: string;
      badMint?: boolean;
    };

/** Formatting bound to the page's locale and the series' cash mint. */
function useFmt(report?: ProofReport) {
  const locale = toLocale(useLocale()) as Locale;
  const cash = report?.input.series.data.cashMint ?? "";
  const dec = report?.input.cashDecimals ?? 2;
  const sign = CASH_SIGN[cash] ?? "";
  const num = (n: bigint | number) => formatAmount(BigInt(n), 0, locale);
  return {
    locale,
    num,
    money: (minor: bigint) =>
      formatMoney(formatAmount(minor, dec, locale), sign),
    when: (unix: bigint | number) =>
      formatDateTime(new Date(Number(unix) * 1000).toISOString(), locale),
    pct: (bps: number) => bpsToPercent(bps, locale),
  };
}
type Fmt = ReturnType<typeof useFmt>;

const shortHash = (h: string) => `${h.slice(0, 8)}…${h.slice(-4)}`;

function duration(secs: bigint, locale: string) {
  const s = Number(secs);
  const [n, unit] =
    s < 60
      ? [s, "second"]
      : s < 3600
        ? [Math.round(s / 60), "minute"]
        : s < 86400
          ? [Math.round(s / 3600), "hour"]
          : [Math.round(s / 86400), "day"];
  return new Intl.NumberFormat(
    locale === "en" ? "en" : locale === "kk" ? "kk" : "ru",
    {
      style: "unit",
      unit,
      unitDisplay: "short",
    },
  ).format(n);
}

/**
 * `/proof/[mint]`: reads one series straight from devnet over RPC, re-verifies every corporate action in the
 * browser (lib/proof) and renders the result as a certificate — ✓/✗ per check with the numbers behind it and every
 * transaction linked to the explorer.
 */
export function ProofView({ mint }: { mint: string }) {
  const t = useTranslations("proof");
  const tc = useTranslations("common");
  const [state, setState] = useState<State>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    let seq = 0;
    setState({ phase: "loading" });
    loadProof(createProofRpc(), mint, (input) => {
      const n = ++seq;
      void verifyProof(input).then((report) => {
        if (live && n === seq) setState({ phase: "ready", report });
      });
    })
      .then((found) => {
        if (live && !found) setState({ phase: "missing" });
      })
      .catch((e: unknown) => {
        if (!live) return;
        const msg = e instanceof Error ? e.message : String(e);
        setState({
          phase: "error",
          message: msg,
          badMint: /address|base58|length/i.test(msg),
        });
      });
    return () => {
      live = false;
    };
  }, [mint, attempt]);

  return (
    <div className="mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      {state.phase === "missing" ? (
        <EmptyState
          title={t("error.missingTitle")}
          body={t("error.missingText", { mint: shortKey(mint, 6, 6) })}
        />
      ) : state.phase === "error" ? (
        <div
          role="alert"
          className="rounded-card border border-err-bd bg-err-bg p-6"
        >
          <h1 className="text-lg font-bold text-err-fg">{t("error.title")}</h1>
          <p className="mt-1 max-w-[62ch] text-sm text-n700">
            {t("error.text", {
              message: state.badMint
                ? t("error.badMint")
                : (state.message ?? ""),
            })}
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => setAttempt((n) => n + 1)}
          >
            {tc("retry")}
          </Button>
        </div>
      ) : (
        <Body report={state.report} />
      )}
    </div>
  );
}

function Body({ report }: { report?: ProofReport }) {
  const t = useTranslations("proof");
  const s = useTranslations("landing.simulated");
  const fmt = useFmt(report);
  const coupons = new Map<number, number>();
  for (const a of report?.actions ?? [])
    if (a.kind === 0) coupons.set(a.index, coupons.size + 1);
  return (
    <>
      <Certificate report={report} fmt={fmt} />
      <HowItWorks />

      <section aria-labelledby="proof-actions" className="mt-10 sm:mt-14">
        <h2 id="proof-actions" className="text-lg font-bold tracking-tight">
          {t("actionsTitle")}
        </h2>
        <div className="mt-4 space-y-6">
          {report
            ? report.actions.map((a) => (
                <ActionCard
                  key={a.address}
                  a={a}
                  n={coupons.get(a.index) ?? 0}
                  report={report}
                  fmt={fmt}
                />
              ))
            : [0, 1].map((i) => (
                <Skeleton key={i} className="h-72 rounded-card" />
              ))}
        </div>
      </section>

      {report && report.seriesTxs.length > 0 && (
        <section className="mt-10">
          <details className="group rounded-card border border-n200 bg-n0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 sm:p-5">
              <span>
                <span className="block text-base font-bold">
                  {t("txs.seriesTitle")}
                </span>
                <span className="block text-sm text-n600">
                  {t("txs.seriesText")}
                </span>
              </span>
              <span className="num shrink-0 text-sm font-semibold text-g700">
                {t("txs.title", { n: report.seriesTxs.length })}
                <span
                  aria-hidden
                  className="ml-1 inline-block transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </span>
            </summary>
            <div className="border-t border-n100 px-4 pb-2 sm:px-5">
              <TxList txs={report.seriesTxs} fmt={fmt} />
            </div>
          </details>
        </section>
      )}

      <section aria-labelledby="proof-scope" className="mt-14 sm:mt-16">
        <h2 id="proof-scope" className="text-lg font-bold tracking-tight">
          {s("title")}
        </h2>
        <p className="mt-1 mb-5 max-w-[62ch] text-sm text-n600">
          {t("scopeText")}
        </p>
        <ScopeGrid />
      </section>

      <section className="mt-10 rounded-card border border-dashed border-n300 bg-n0 p-5 sm:p-6">
        <h2 className="text-base font-bold">{t("selfHost.title")}</h2>
        <p className="mt-1 max-w-[62ch] text-sm text-n600">
          {t("selfHost.text")}
        </p>
        <pre className="mt-3 rounded-sm bg-p900 px-4 py-3 font-mono text-xs leading-relaxed break-all whitespace-pre-wrap text-p100">
          {`NEXT_PUBLIC_RPC_URL=<your node> pnpm --filter @qupon/web build:proof\n# → apps/web/out-proof/  (open /proof/?mint=<bond mint>)`}
        </pre>
      </section>
    </>
  );
}

/** The verdict stub's seal: a ringed stamp, green when every check passed, red when any failed. */
function Seal({
  tone,
  children,
}: {
  tone: "pass" | "fail" | "wait";
  children: ReactNode;
}) {
  return (
    <div
      className={cx(
        "grid size-24 place-items-center rounded-full border-2 border-dashed p-1.5",
        tone === "pass"
          ? "border-g300"
          : tone === "fail"
            ? "border-err-bd"
            : "border-n300",
      )}
    >
      <div
        className={cx(
          "grid size-full place-items-center rounded-full",
          tone === "pass"
            ? "bg-g600 text-white"
            : tone === "fail"
              ? "bg-default text-white"
              : "bg-n100 text-n700",
        )}
      >
        {children}
      </div>
    </div>
  );
}

function Certificate({ report, fmt }: { report?: ProofReport; fmt: Fmt }) {
  const t = useTranslations("proof");
  const st = useTranslations("status");
  const [verifiedAt, setVerifiedAt] = useState<number | null>(null);
  const input = report?.input;
  const loading = !input || input.txDone < input.txTotal;
  // ETA from the observed read rate (task 91579: the judge sees how long the history walk still needs).
  const startedAt = useRef(0);
  if (input && startedAt.current === 0) startedAt.current = Date.now();
  const eta =
    input && input.txDone > 2 && input.txDone < input.txTotal
      ? Math.max(
          1,
          Math.round(
            (((Date.now() - startedAt.current) / input.txDone) *
              (input.txTotal - input.txDone)) /
              1000,
          ),
        )
      : null;
  useEffect(() => {
    if (!loading) setVerifiedAt(Math.floor(Date.now() / 1000));
  }, [loading]);
  const s = input?.series.data;
  const ticker = s
    ? String.fromCharCode(...Array.from(s.ticker).filter((x) => x !== 0))
    : "";
  const isin = s
    ? String.fromCharCode(...Array.from(s.isin).filter((x) => x !== 0))
    : "";
  const holders = new Set(input?.investors.map((i) => String(i.data.owner)))
    .size;
  const tone = loading ? "wait" : report!.failed > 0 ? "fail" : "pass";
  const rpcHost = (() => {
    try {
      // Which devnet endpoint actually answered the verifier's requests (A91571-5).
      return new URL(answeredByRpc()).host;
    } catch {
      return answeredByRpc();
    }
  })();
  const fact = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-n600">{label}</dt>
      <dd className="num mt-0.5 text-base font-bold break-words text-n900">
        {value}
      </dd>
    </div>
  );

  return (
    <section
      aria-label={t("eyebrow")}
      // opus #20: a phone column (not block) so the verdict aside can order-first below sm; ≥ sm the row is unchanged
      className="overflow-hidden rounded-card border border-n200 bg-n0 flex flex-col sm:flex-row"
      style={{ ["--qp-sheet-bg" as string]: "var(--color-n50)" }}
    >
      <div className="min-w-0 flex-1 p-5 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <ProvenanceChip kind="verified">{t("chip")}</ProvenanceChip>
          {s && s.daySecs > 0 && (
            <ProvenanceChip kind="demo">
              {t("demoClock", { secs: s.daySecs })}
            </ProvenanceChip>
          )}
        </div>
        <p className="mt-5 text-sm font-semibold text-n600">{t("eyebrow")}</p>
        {s ? (
          <>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-title font-extrabold tracking-tight">
                {ticker}
              </h1>
              <Badge
                tone={
                  s.inDefault
                    ? "danger"
                    : s.status === 3
                      ? "neutral"
                      : "success"
                }
              >
                {st(
                  s.inDefault
                    ? "Defaulted"
                    : (SERIES_STATUS[s.status] ?? "Active"),
                )}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-n600">
              <span className="num">{isin}</span>
              <span aria-hidden>·</span>
              <Address value={input.mint} />
            </div>
          </>
        ) : (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </div>
        )}
        <p className="mt-5 max-w-[62ch] text-base leading-relaxed text-n700">
          {t("lead")}
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-n100 pt-5 lg:grid-cols-4">
          {s && input ? (
            <>
              {fact(t("facts.face"), fmt.money(s.faceValue))}
              {fact(t("facts.coupon"), fmt.pct(s.couponRateBps))}
              {fact(
                t("facts.record"),
                s.hook === 1 ? t("facts.recordHook") : t("facts.recordPause"),
              )}
              {fact(t("facts.holders"), fmt.num(holders))}
            </>
          ) : (
            [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)
          )}
        </dl>
        <p className="mt-5 text-xs leading-relaxed text-n600">
          {t("source", {
            rpc: rpcHost,
            slot: input ? fmt.num(input.slot) : "…",
            program: shortKey(QUPON_BONDS_PROGRAM_ADDRESS, 4, 4),
          })}
        </p>
      </div>

      <aside
        aria-live="polite"
        className={cx(
          // opus #20: on phones the verdict comes first (max-sm:order-first); qp-perf-b moves its perforation to the
          // bottom edge so the dashed line still sits between the stub and the certificate body
          "qp-perf qp-perf-b flex flex-col items-center justify-center gap-3 px-6 py-8 text-center max-sm:order-first max-sm:py-6 sm:w-[300px] sm:shrink-0",
          tone === "pass" ? "bg-g50" : tone === "fail" ? "bg-err-bg" : "bg-n50",
        )}
      >
        <Seal tone={tone}>
          {tone === "wait" ? (
            <span className="num text-sm font-bold">
              {input ? `${input.txDone}/${input.txTotal}` : "…"}
            </span>
          ) : (
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              className="size-10"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path
                d={
                  tone === "pass"
                    ? "m5 12.5 4.5 4.5L19 7.5"
                    : "M7 7l10 10M17 7 7 17"
                }
              />
            </svg>
          )}
        </Seal>
        {tone === "wait" ? (
          <div className="w-full max-w-[220px]">
            <p className="text-lg font-extrabold text-n900">
              {t("seal.loading")}
            </p>
            {input && (
              <>
                <p className="num mt-1 text-sm text-n600">
                  {t("seal.progress", {
                    done: input.txDone,
                    total: input.txTotal,
                  })}
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-n200">
                  <div
                    className="qp-bar h-full rounded-full bg-g600"
                    style={{
                      scale: `${input.txTotal ? input.txDone / input.txTotal : 0} 1`,
                    }}
                  />
                </div>
                {eta != null && (
                  <p className="num mt-1.5 text-xs text-n500">
                    {t("seal.eta", { sec: eta })}
                  </p>
                )}
              </>
            )}
          </div>
        ) : (
          <div>
            <p
              className={cx(
                "num text-4xl leading-none font-extrabold tracking-tight",
                tone === "pass" ? "text-g800" : "text-err-fg",
              )}
            >
              {report!.passed}/{report!.passed + report!.failed}
            </p>
            <p
              data-testid="proof-verdict"
              className={cx(
                "mt-2 text-lg font-extrabold tracking-tight",
                tone === "pass" ? "text-g800" : "text-err-fg",
              )}
            >
              {tone === "pass"
                ? t("seal.pass")
                : t("seal.fail", { n: report!.failed })}
            </p>
            <p className="num mt-1 text-sm text-n700">
              {t("seal.sub", {
                actions: report!.actions.length,
                txs: input!.txTotal,
              })}
            </p>
            {verifiedAt && (
              <p className="num mt-3 text-xs text-n600">
                {t("seal.at", { when: fmt.when(verifiedAt) })}
              </p>
            )}
          </div>
        )}
      </aside>
    </section>
  );
}

function HowItWorks() {
  const t = useTranslations("proof.how");
  const steps = [
    ["read", "readText"],
    ["recompute", "recomputeText"],
    ["compare", "compareText"],
  ] as const;
  return (
    <section aria-label={t("title")} className="mt-6">
      <ol className="grid divide-y divide-n100 rounded-card border border-n200 bg-n0 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {steps.map(([k, text], i) => (
          <li key={k} className="flex gap-3 p-4 sm:p-5">
            <span
              aria-hidden
              className="num grid size-7 shrink-0 place-items-center rounded-full bg-p900 text-xs font-bold text-white"
            >
              {i + 1}
            </span>
            <span>
              <span className="block text-sm font-bold text-n900">{t(k)}</span>
              <span className="mt-0.5 block text-sm leading-relaxed text-n600">
                {t(text)}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Shared copy: action kinds from landing.kinds, statuses and journal events from the base `status` namespace. */
const KIND_CODE = ["INTR", "REDM", "MCAL", "PCAL", "BMET", "CHAN"];
const SERIES_STATUS = ["Active", "Matured", "Retiring", "Closed"];
const IX_EVENT: Record<string, string> = {
  InitSeries: "SeriesInitialized",
  RegisterInvestor: "InvestorRegistered",
  SuspendInvestor: "InvestorStatusChanged",
  ReinstateInvestor: "InvestorStatusChanged",
  Subscribe: "Subscribed",
  IssueUnits: "UnitsIssued",
  AnnounceAction: "ActionAnnounced",
  CancelAction: "ActionCancelled",
  StrikeRecord: "RecordStruck",
  SnapshotBatch: "HolderSnapshotted",
  FinalizeSnapshot: "SnapshotFinalized",
  FundAction: "ActionFunded",
  PayBatch: "EntitlementPaid",
  CompleteAction: "ActionCompleted",
  RetireBatch: "UnitsRetired",
  CloseSeries: "SeriesClosed",
  CastVote: "VoteCast",
  FinalizeMeeting: "MeetingFinalized",
  ApplyTermsChange: "TermsChanged",
};

function ActionCard({
  a,
  n,
  report,
  fmt,
}: {
  a: ActionReport;
  n: number;
  report: ProofReport;
  fmt: Fmt;
}) {
  const t = useTranslations("proof");
  const tb = useTranslations("bond");
  const tk = useTranslations("landing.kinds");
  const scored = a.checks.filter(
    (c) => c.status === "pass" || c.status === "fail",
  );
  const passed = scored.filter((c) => c.status === "pass").length;
  const failed = scored.length - passed;
  const cash = a.kind <= 3;
  return (
    <article
      id={a.address}
      data-testid="proof-action"
      className="scroll-mt-32 rounded-card border border-n200 bg-n0"
    >
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-n100 p-4 sm:p-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg font-bold tracking-tight">
              {a.kind === 0
                ? tb("rail.coupon", { n })
                : tk(KIND_CODE[a.kind] ?? "INTR")}
            </h3>
            <Badge status={ACTION_STATUS[a.status] ?? "Announced"} />
          </div>
          <p className="num mt-1 text-sm text-n600">
            {a.corpId}
            <span aria-hidden> · </span>
            {t("actionMeta", {
              record: fmt.when(a.recordAt),
              payment: fmt.when(a.paymentAt),
            })}
            {cash && a.kind !== 4 && (
              <>
                <span aria-hidden> · </span>
                {t("actionRate", {
                  rate: fmt.pct(a.rateBps),
                  days: a.accrualDays,
                })}
              </>
            )}
          </p>
        </div>
        {scored.length > 0 && (
          <span
            className={cx(
              "num inline-flex h-8 items-center rounded-full px-3 text-sm font-bold",
              failed ? "bg-default text-white" : "bg-g50 text-g700",
            )}
          >
            {t("verdict", { passed, total: scored.length })}
          </span>
        )}
      </header>

      <div className="p-4 sm:p-6">
        {a.status === 7 ? (
          <p className="text-sm text-n600">{t("cancelled")}</p>
        ) : a.status === 0 ? (
          <p className="text-sm text-n600">{t("notYet")}</p>
        ) : null}
        {a.checks.length > 0 && (
          <ul className="-mx-4 divide-y divide-n100 border-y border-n100 sm:mx-0 sm:rounded-btn sm:border sm:border-n200">
            {a.checks.map((c) => (
              <CheckRow key={c.id} c={c} report={report} fmt={fmt} />
            ))}
          </ul>
        )}
        {a.holders.length > 0 && <Holders a={a} fmt={fmt} />}
        {a.txs.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-bold text-n900">
              {t("txs.title", { n: a.txs.length })}
            </h4>
            <TxList txs={a.txs} fmt={fmt} />
          </div>
        )}
      </div>
    </article>
  );
}

function Mark({ status }: { status: Check["status"] }) {
  const d =
    status === "pass"
      ? "m4 8.5 2.8 2.8L12 5.5"
      : status === "fail"
        ? "M5 5l6 6M11 5l-6 6"
        : status === "info"
          ? "M8 7.5V11M8 5h.01"
          : "M4.5 8h.01M8 8h.01M11.5 8h.01";
  return (
    <span
      className={cx(
        "mt-0.5 grid size-6 shrink-0 place-items-center rounded-full",
        status === "pass" && "bg-g600 text-white",
        status === "fail" && "bg-default text-white",
        status === "pending" && "border border-dashed border-n300 text-n500",
        status === "info" && "bg-n100 text-n600",
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden
        className="size-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

function CheckRow({
  c,
  report,
  fmt,
}: {
  c: Check;
  report: ProofReport;
  fmt: Fmt;
}) {
  const t = useTranslations("proof.check");
  const { input } = report;
  const v = c.v;
  const m = (k: string) => fmt.money(BigInt(v[k] ?? 0));
  const waiting =
    c.status === "pending" && input.txDone < input.txTotal && c.id !== "payouts"
      ? t("waiting", { done: input.txDone, total: input.txTotal })
      : null;
  let text: string;
  switch (c.id) {
    case "entitlements":
      text = t(`entitlements.${c.status === "pass" ? "pass" : "fail"}`, {
        ok: Number(v.ok),
        total: Number(v.total),
        bad: Number(v.total) - Number(v.ok),
      });
      break;
    case "supply":
      text = t(
        `supply.${c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "pending"}`,
        {
          units: fmt.num(BigInt(v.units ?? 0)),
          supply: fmt.num(BigInt(v.supply ?? 0)),
        },
      );
      break;
    case "hash":
      text = t(`hash.${c.status === "pass" ? "pass" : "fail"}`, {
        scheme: t(`hash.scheme${v.scheme === 1 ? 1 : 0}`),
      });
      break;
    case "totals":
      text = t(`totals.${c.status === "pass" ? "pass" : "fail"}`, {
        gross: m("gross"),
        tax: m("tax"),
        net: m("net"),
        principal: m("principal"),
        holders: Number(v.holders),
        bad: String(v.bad),
      });
      break;
    case "funded":
      text = t(
        `funded.${c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "pending"}`,
        {
          deposited: m("deposited"),
          required: m("required"),
        },
      );
      break;
    case "payouts":
      text = t(
        `payouts.${c.status === "pass" ? "pass" : c.status === "fail" ? "fail" : "pending"}`,
        {
          paidOut: m("paidOut"),
          owed: m("owed"),
          holders: Number(v.holders),
        },
      );
      break;
    case "default":
      text = t(
        c.status === "fail"
          ? "default.fail"
          : Number(v.cured)
            ? "default.pass"
            : "default.passOpen",
        {
          balance: m("balance"),
          required: m("required"),
          late: duration(BigInt(v.late ?? 0), fmt.locale),
        },
      );
      break;
    case "bank":
      text = t(`bank.${c.status === "fail" ? "fail" : "pass"}`, {
        confirmed: Number(v.confirmed),
        pending: Number(v.pending),
      });
      break;
    default:
      text = t(c.status === "pass" ? "disclosure.pass" : "disclosure.info", {
        hash: shortHash(String(v.hash)),
      });
  }
  // The figure the check stands on, right-aligned like a ledger column (≥ 640 px; phones read it in the sentence).
  const figure =
    waiting || c.status === "info" || c.status === "pending"
      ? null
      : c.id === "entitlements"
        ? `${v.ok}/${v.total}`
        : c.id === "supply"
          ? `${fmt.num(BigInt(v.units ?? 0))} = ${fmt.num(BigInt(v.supply ?? 0))}`
          : c.id === "hash"
            ? shortHash(String(v.expected))
            : c.id === "totals"
              ? fmt.money(BigInt(v.gross ?? 0) + BigInt(v.principal ?? 0))
              : c.id === "funded"
                ? m("deposited")
                : c.id === "payouts"
                  ? m("paidOut")
                  : c.id === "default"
                    ? Number(v.cured)
                      ? `+${duration(BigInt(v.late ?? 0), fmt.locale)}`
                      : m("balance")
                    : c.id === "bank"
                      ? `${v.confirmed}/${Number(v.confirmed) + Number(v.pending)}`
                      : shortHash(String(v.hash));
  return (
    <li
      data-check={c.id}
      data-status={c.status}
      className="flex gap-3 px-4 py-3 sm:p-4"
    >
      <Mark status={waiting ? "pending" : c.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-n900">
            {t(`${c.id}.title`)}
          </span>
          {c.id === "bank" && <ProvenanceChip kind="simulated" />}
          <span className="sr-only">
            {c.status === "pass" ? "✓" : c.status === "fail" ? "✗" : ""}
          </span>
        </div>
        <p className="mt-0.5 text-sm leading-relaxed text-n600">
          {waiting ?? text}
        </p>
        {c.id === "hash" && (
          <p className="num mt-1 text-xs text-n600">
            {t("hash.onchain")}{" "}
            <span className="whitespace-nowrap">
              {shortHash(String(v.onchain))}
            </span>
            <span aria-hidden> · </span>
            {t("hash.recomputed")}{" "}
            <span className="whitespace-nowrap">
              {shortHash(String(v.expected))}
            </span>
          </p>
        )}
        {c.tx && (
          <p className="mt-1 text-xs">
            <Address value={c.tx} kind="tx" />
          </p>
        )}
        {c.id === "disclosure" && c.status === "pass" && (
          <FileCheck hash={String(v.hash)} />
        )}
      </div>
      {figure && (
        <span
          className={cx(
            "num hidden shrink-0 pt-0.5 text-sm font-bold whitespace-nowrap sm:block",
            c.status === "fail" ? "text-err-fg" : "text-n900",
          )}
        >
          {figure}
        </span>
      )}
    </li>
  );
}

/** Hash a local file in the browser and compare it with the anchored disclosure hash. */
function FileCheck({ hash }: { hash: string }) {
  const t = useTranslations("proof.check.disclosure");
  const [got, setGot] = useState<string | null>(null);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-3">
      <label className="inline-flex h-8 cursor-pointer items-center rounded-btn border border-n300 bg-n0 px-3 text-xs font-bold text-n700 hover:bg-n50">
        {t("file")}
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            void f
              .arrayBuffer()
              .then((b) => crypto.subtle.digest("SHA-256", b))
              .then((d) => setGot(hex(new Uint8Array(d))));
          }}
        />
      </label>
      {got && (
        <span
          role="status"
          className={cx(
            "text-xs font-semibold",
            got === hash ? "text-g700" : "text-err-fg",
          )}
        >
          {got === hash ? t("match") : t("differ", { hash: shortHash(got) })}
        </span>
      )}
    </div>
  );
}

function Holders({ a, fmt }: { a: ActionReport; fmt: Fmt }) {
  const t = useTranslations("proof.holders");
  const st = useTranslations("status");
  const holderStatus = (n: number) =>
    n === 3
      ? t("paidToAgent")
      : st(["Snapshotted", "Paid", "Retired"][n] ?? "Snapshotted");
  const principal = a.holders.some((h) => h.onchain.principal > 0n);
  const cols = (h: HolderRow) => [
    [t("gross"), fmt.money(h.onchain.gross)],
    [t("tax"), fmt.money(h.onchain.tax)],
    [t("net"), fmt.money(h.onchain.net)],
    ...(principal ? [[t("principal"), fmt.money(h.onchain.principal)]] : []),
  ];
  const ok = (h: HolderRow) => (
    <span
      className={cx(
        "inline-flex items-center gap-1 text-xs font-bold",
        h.ok ? "text-g700" : "text-err-fg",
      )}
    >
      <span aria-hidden>{h.ok ? "✓" : "✗"}</span>
      {h.ok ? t("ok") : t("bad")}
    </span>
  );
  const expected = (h: HolderRow) =>
    !h.ok && h.expected ? (
      <div className="num mt-1 text-xs text-err-fg">
        {t("expected", {
          gross: fmt.money(h.expected.gross),
          tax: fmt.money(h.expected.tax),
          net: fmt.money(h.expected.net),
          principal: fmt.money(h.expected.principal),
        })}
      </div>
    ) : null;
  return (
    <div className="mt-6">
      <h4 className="text-sm font-bold text-n900">
        {t("title", { n: a.holders.length })}
      </h4>
      {/* phone: one card per holder */}
      <ul className="mt-2 space-y-2 sm:hidden">
        {a.holders.map((h) => (
          <li key={h.owner} className="rounded-btn border border-n200 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <Address value={h.owner} />
              {ok(h)}
            </div>
            <div className="num mt-1 text-xs text-n600">
              {t("units")} {fmt.num(h.units)} · {t("taxRate")}{" "}
              {h.taxBps === null ? "—" : fmt.pct(h.taxBps)} ·{" "}
              {holderStatus(h.status)}
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {cols(h).map(([k, v]) => (
                <div key={k} className="flex justify-between gap-2">
                  <dt className="text-n600">{k}</dt>
                  <dd className="num font-semibold text-n900">{v}</dd>
                </div>
              ))}
            </dl>
            {expected(h)}
          </li>
        ))}
      </ul>
      {/* ≥ 640 px: a dense table */}
      <div className="mt-2 hidden overflow-x-auto rounded-btn border border-n200 sm:block">
        <table className="w-full text-dense">
          <thead className="bg-n50 text-left text-xs text-n600">
            <tr>
              <th className="px-3 py-2 font-semibold">{t("holder")}</th>
              <th className="px-3 py-2 text-right font-semibold">
                {t("units")}
              </th>
              <th className="px-3 py-2 text-right font-semibold">
                {t("taxRate")}
              </th>
              {cols(a.holders[0]!).map(([k]) => (
                <th key={k} className="px-3 py-2 text-right font-semibold">
                  {k}
                </th>
              ))}
              <th className="px-3 py-2 font-semibold">{t("status")}</th>
              <th className="px-3 py-2 font-semibold">{t("check")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-n100">
            {a.holders.map((h) => (
              <tr key={h.owner} className={cx(!h.ok && "bg-err-bg/50")}>
                <td className="px-3 py-2.5">
                  <Address value={h.owner} />
                  {expected(h)}
                </td>
                <td className="num px-3 py-2.5 text-right font-semibold">
                  {fmt.num(h.units)}
                </td>
                <td className="num px-3 py-2.5 text-right text-n600">
                  {h.taxBps === null ? "—" : fmt.pct(h.taxBps)}
                </td>
                {cols(h).map(([k, v]) => (
                  <td
                    key={k}
                    className="num px-3 py-2.5 text-right whitespace-nowrap"
                  >
                    {v}
                  </td>
                ))}
                <td className="px-3 py-2.5 text-n700">
                  {holderStatus(h.status)}
                </td>
                <td className="px-3 py-2.5">{ok(h)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TxList({ txs, fmt }: { txs: ChainTx[]; fmt: Fmt }) {
  const t = useTranslations("proof.txs");
  const st = useTranslations("status");
  return (
    <ol className="mt-2 divide-y divide-n100">
      {txs.map((tx) => {
        const ix = tx.ixs[0] ?? "other";
        return (
          <li
            key={tx.signature}
            className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-0.5 py-2 text-dense sm:grid-cols-[150px_1fr_auto]"
          >
            <span className="num text-xs text-n600 max-sm:col-span-2 max-sm:row-start-1">
              {tx.blockTime ? fmt.when(tx.blockTime) : `#${fmt.num(tx.slot)}`}
            </span>
            <span className="min-w-0 font-semibold text-n900">
              {IX_EVENT[ix]
                ? st(IX_EVENT[ix])
                : t.has(`ix.${ix}`)
                  ? t(`ix.${ix}` as "ix.other")
                  : ix}
              {tx.failed && (
                <span className="ml-2 rounded-full bg-err-bg px-2 py-0.5 text-micro font-bold text-err-fg">
                  {t("failed")}
                </span>
              )}
            </span>
            <span className="justify-self-end">
              <Address value={tx.signature} kind="tx" />
            </span>
          </li>
        );
      })}
    </ol>
  );
}
