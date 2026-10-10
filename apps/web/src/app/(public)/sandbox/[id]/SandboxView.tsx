"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { HelpMenu } from "@/components/shell/HelpMenu";
import { Tour } from "@/components/shell/Tour";
import { ActionFlow, type FlowStep } from "@/components/ui/ActionFlow";
import { Button } from "@/components/ui/Button";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { LifecycleRail, type RailNode } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { NowBar } from "@/components/ui/NowBar";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { type Locale } from "@/i18n/locale";
import { buildTimeline, STEP_ACTOR } from "@/lib/actionFlow";
import type { EntitlementDTO } from "@/lib/api";
import { BoError, explainBoError } from "@/lib/boClient";
import { moneyFlowOf } from "@/lib/moneyFlow";
import {
  currentAction,
  pollSandbox,
  runScenario,
  type Sandbox,
  type SandboxAction,
  type ScenarioKind,
} from "@/lib/sandbox";
import { cx } from "@/lib/ui/cx";
import { formatAmount } from "@/lib/ui/amount";
import {
  ClockCard,
  Feed,
  Register,
  RoleCard,
  type Role,
  Scenarios,
  Segmented,
  useClaim,
} from "./panels";

const ROLES: Role[] = ["anyone", "issuer", "registrar", "investor"];
const POLL_MS = 2000;

/** Σ net + tax + principal of the action's snapshot: what the escrow must hold. */
export const requiredOf = (a: SandboxAction) =>
  BigInt(a.totalGross?.minor ?? "0") +
  BigInt(a.perUnitPrincipal.minor) * BigInt(a.unitsSnapshotted ?? "0");

/**
 * The judge sandbox (task 1532): the visitor's own demo-clock series on devnet, driven by the registrar's
 * autopilot and polled every 2 s. Now bar, coupon sheet, the four scenarios, the live action's steps, the register
 * as it fills at the record date, the money flow during the payout, a role lens and every transaction.
 */
export function SandboxView({
  initial,
  locale,
  mock,
}: {
  initial: Sandbox;
  locale: Locale;
  /** mock registrar (e2e, local dev): fixture signatures, labelled as such */
  mock: boolean;
}) {
  const t = useTranslations("sandbox");
  const [s, setS] = useState(initial);
  const [skew, setSkew] = useState(0); // server clock − browser clock
  const [gone, setGone] = useState(false);
  const [stale, setStale] = useState(false);
  const [role, setRole] = useState<Role>("anyone");
  const [busy, setBusy] = useState<ScenarioKind | null>(null);
  const [scenarioError, setScenarioError] = useState<{
    kind: ScenarioKind;
    text: string;
  } | null>(null);
  const tErr = useTranslations("errors");

  const refresh = useCallback(async () => {
    const fresh = await pollSandbox(initial.id);
    if (!fresh) return setGone(true);
    setSkew(fresh.serverTime - Date.now());
    setS(fresh);
    setStale(false);
  }, [initial.id]);

  useEffect(() => {
    setSkew(initial.serverTime - Date.now());
    const id = setInterval(() => {
      if (!document.hidden) refresh().catch(() => setStale(true));
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh, initial.serverTime]);

  const run = async (kind: ScenarioKind) => {
    setBusy(kind);
    setScenarioError(null);
    try {
      await runScenario(s.id, kind);
      await refresh();
    } catch (e) {
      const text =
        e instanceof BoError
          ? explainBoError(
              e,
              Object.assign((k: string) => tErr(k), { has: tErr.has }),
            )
          : String(e);
      setScenarioError({ kind, text });
    } finally {
      setBusy(null);
    }
  };

  const a = currentAction(s);
  const claim = useClaim(s, a);
  const toClient = (serverMs: number) => serverMs - skew;
  const money = (minor: bigint | string) => formatAmount(minor, 2, locale);
  const name = (owner: unknown) =>
    s.holders.find((h) => h.owner === owner)?.label ??
    String(owner).slice(0, 4);
  const actionName = (x: SandboxAction | null | undefined) =>
    !x
      ? ""
      : x.kind === "REDM"
        ? t("rail.maturity")
        : t("rail.coupon", { n: s.actions.indexOf(x) + 1 });
  const closed = s.series.status === "Closed";

  // ---------- Now bar ----------
  const nb = nowOf();
  function nowOf(): {
    key: string;
    values?: Record<string, string | number>;
    tone: "default" | "attention" | "danger" | "done";
    clock?: { key: string; at: number };
    action?: ReactNode;
  } {
    const at = s.next.at;
    if (closed)
      return {
        key: "redeemed",
        tone: "done",
        action: (
          <Button asChild variant="secondary">
            <Link href="/sandbox/new?fresh=1">{t("startNew")}</Link>
          </Button>
        ),
      };
    if (!a)
      return {
        key: "issued",
        tone: "default",
        values: {
          ticker: s.series.ticker,
          units: s.series.totalIssued,
          holders: s.holders.length,
        },
        clock: at ? { key: "announce", at } : undefined,
      };
    const n = actionName(a);
    const count = a.holdersSnapshotted ?? 0;
    const required = requiredOf(a);
    switch (a.status) {
      case "Announced":
        return {
          key: "announced",
          tone: "default",
          values: { action: n },
          clock: { key: "record", at: Date.parse(a.recordAt) },
        };
      case "RecordStruck":
        return {
          key: "snapshot",
          tone: "default",
          values: {
            done: s.entitlements.length,
            count: s.holders.filter((h) => h.units !== "0").length,
          },
        };
      case "SnapshotComplete":
        return s.autofund
          ? {
              key: "funding",
              tone: "default",
              values: {
                count,
                units: a.unitsSnapshotted ?? "0",
                amount: money(required),
              },
            }
          : {
              key: "skipped",
              tone: "attention",
              values: { amount: money(required) },
              clock: at ? { key: "grace", at } : undefined,
            };
      case "Defaulted":
        return {
          key: "defaulted",
          tone: "danger",
          values: {
            action: n,
            amount: money(required - BigInt(a.escrowBalance?.minor ?? "0")),
          },
          action: (
            <Button loading={busy === "cure"} onClick={() => run("cure")}>
              {t("btn.cure", {
                amount: money(required - BigInt(a.escrowBalance?.minor ?? "0")),
              })}
            </Button>
          ),
        };
      case "Funded":
        return {
          key: "funded",
          tone: "default",
          values: { amount: money(required), count },
          clock:
            Date.parse(a.paymentAt) > s.serverTime
              ? { key: "payment", at: Date.parse(a.paymentAt) }
              : undefined,
        };
      case "Settling": {
        const agent = s.entitlements.find((e) => e.status === "PaidToAgent");
        if (
          claim.mine &&
          claim.mine.status === "Snapshotted" &&
          (a.holdersPaid ?? 0) >= count - 1
        )
          return {
            key: "claim",
            tone: "attention",
            values: {
              amount: money(
                BigInt(claim.mine.net?.minor ?? "0") +
                  BigInt(claim.mine.principal?.minor ?? "0"),
              ),
            },
            clock: at ? { key: "claim", at } : undefined,
            action: claim.button,
          };
        if ((a.holdersPaid ?? 0) < count)
          return {
            key: "paying",
            tone: "default",
            values: { done: a.holdersPaid ?? 0, count },
          };
        if (agent)
          return {
            key: "bank",
            tone: "attention",
            values: {
              who: name(agent.owner),
              amount: money(
                BigInt(agent.net?.minor ?? "0") +
                  BigInt(agent.principal?.minor ?? "0"),
              ),
            },
          };
        return { key: "complete", tone: "default", values: { action: n } };
      }
      default:
        return {
          key: "paid",
          tone: "done",
          values: {
            action: n,
            net: money(a.totalNet?.minor ?? "0"),
            count,
            tax: money(a.totalTax?.minor ?? "0"),
          },
          clock: at ? { key: "next", at } : undefined,
        };
    }
  }
  const actor = s.next.actor ?? undefined;
  const nowDetail =
    a?.status === "Settling" &&
    s.entitlements.some((e) => e.status === "PaidToAgent") ? (
      <span className="inline-flex flex-wrap items-center gap-2">
        {t("who.payingAgent")}{" "}
        <ProvenanceChip kind="simulated">{t("bankSimulated")}</ProvenanceChip>
      </span>
    ) : actor && !closed ? (
      // phones: the docked bar keeps to the sentence, the clock and the actor chip
      <span className="max-sm:hidden">{t(`who.${actor}`)}</span>
    ) : undefined;

  // ---------- coupon sheet ----------
  const bondDay = (iso: string) => {
    const d = Math.floor(
      (Date.parse(iso) / 1000 - s.clock.issueTs) / s.clock.daySecs,
    );
    return new Date(
      Date.parse(`${s.series.issueDate}T00:00:00Z`) + d * 86_400_000,
    )
      .toISOString()
      .slice(0, 10);
  };
  const civil = (ymd: string) => `${ymd}T00:00:00+05:00`;
  /** A real instant on the bond's own clock: issue date + elapsed × (one day / daySecs), so times keep their order. */
  const bondIso = (iso: string) =>
    new Date(
      Date.parse(civil(s.series.issueDate)) +
        (Date.parse(iso) - s.clock.issueTs * 1000) * (86_400 / s.clock.daySecs),
    ).toISOString();
  const rail: RailNode[] = [
    {
      id: "issue",
      kind: "issue",
      title: t("rail.issue"),
      date: civil(s.series.issueDate),
      status: "done",
      statusLabel: t("rail.placed"),
      txCount: s.activity.filter(
        (e) => !e.actionPda && !e.kind.startsWith("Trade"),
      ).length,
    },
    ...s.schedule.map((item, i): RailNode => {
      const act = s.actions[i];
      const last = i === s.schedule.length - 1;
      return {
        id: `c${item.couponNumber}`,
        kind: last ? "maturity" : "coupon",
        title: last
          ? t("rail.maturity")
          : t("rail.coupon", { n: item.couponNumber }),
        date: civil(bondDay(item.paymentDate)),
        status: !act
          ? "upcoming"
          : act.status === "Defaulted"
            ? "defaulted"
            : act.status === "Completed"
              ? act.curedAt
                ? "cured"
                : "done"
              : "live",
        amount: {
          minor: (
            BigInt(item.amountPerUnit?.minor ?? "0") +
            (last ? BigInt(s.series.faceValue.minor) : 0n)
          ).toString(),
          currency: s.series.faceValue.currency,
        },
        txCount: act
          ? s.activity.filter((e) => e.actionPda === act.pda).length ||
            undefined
          : undefined,
      };
    }),
  ];

  // ---------- the live action's steps ----------
  const tstep = useTranslations("steps");
  // six steps, so the flow stays one row on desktop: finalize folds into the snapshot (its tx closes it), and a
  // redemption's burn happens inside pay (plan 15 D5), so retire/close are not separate steps here
  const timeline = a ? buildTimeline(a, s.activity, closed) : [];
  const fin = timeline.find((st) => st.id === "finalize");
  // the snapshot is done once it is final (holders are snapshotted one by one before that)
  const merged = timeline
    .filter((st) => !["finalize", "retire", "close"].includes(st.id))
    .map((st) =>
      st.id === "snapshot" && fin
        ? fin.state === "done"
          ? {
              ...st,
              state: "done" as const,
              signature: fin.signature ?? st.signature,
              at: fin.at ?? st.at,
            }
          : {
              ...st,
              state: st.state === "done" ? ("current" as const) : st.state,
            }
        : st,
    );
  const flow: FlowStep[] = a
    ? merged.map((st) => {
        const defaulted = st.id === "fund" && a.status === "Defaulted";
        return {
          id: st.id,
          label: tstep(`done.${st.id}`),
          state: defaulted
            ? "defaulted"
            : st.state === "failed"
              ? "failed"
              : st.state,
          at: st.at ? bondIso(st.at) : st.at,
          tx: st.signature,
          actor: STEP_ACTOR[st.id],
          detail: defaulted
            ? t("detail.defaulted", {
                amount: money(
                  requiredOf(a) - BigInt(a.escrowBalance?.minor ?? "0"),
                ),
              })
            : st.id === "fund" && a.curedAt
              ? t("detail.cured")
              : st.id === "strike" && st.state !== "done"
                ? t("detail.hook")
                : st.id === "pay" && (a.bankPending ?? 0) > 0
                  ? t("detail.bank", { n: a.bankPending ?? 0 })
                  : st.id === "snapshot" && st.state === "done"
                    ? t("detail.supply", { units: a.unitsSnapshotted ?? "0" })
                    : st.id === "pay" &&
                        st.state === "done" &&
                        a.kind === "REDM"
                      ? t("detail.burned")
                      : st.detail && st.state !== "pending"
                        ? tstep(`detail.${st.detail.key}`, st.detail.values)
                        : undefined,
          // hooked series: the gate makes the record exact at record_at, whenever the strike tx lands (D1')
          record:
            st.id === "strike"
              ? {
                  planned: bondIso(a.recordAt),
                  effective: st.state === "done" ? bondIso(a.recordAt) : null,
                }
              : undefined,
        };
      })
    : [];

  // ---------- money ----------
  const tm = useTranslations("kit.money");
  const showMoney =
    a &&
    !["Announced", "RecordStruck"].includes(a.status) &&
    s.entitlements.length > 0;
  const mf = a
    ? moneyFlowOf(
        a as never,
        s.entitlements as EntitlementDTO[],
        s.activity,
        (u) => tm("holderSub", { units: u }),
      )
    : null;
  const recipients = (mf?.recipients ?? []).map((r) => {
    if (r.kind === "tax")
      return a?.status === "Defaulted"
        ? { ...r, status: "defaulted" as const }
        : r;
    const e = s.entitlements.find((x) => x.owner === r.id);
    const agent = e?.status === "PaidToAgent";
    return {
      ...r,
      label: name(r.id),
      kind: agent ? ("agent" as const) : r.kind,
      status: agent
        ? ("agent" as const)
        : a?.status === "Defaulted"
          ? ("defaulted" as const)
          : r.status,
    };
  });

  if (gone)
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16 sm:px-6">
        <Gone />
      </div>
    );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      {/* ---------- header ---------- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <ProvenanceChip kind="demo" />
            <ProvenanceChip kind="onchain" href={s.links.explorer}>
              {t("devnet")}
            </ProvenanceChip>
            {mock && (
              <ProvenanceChip kind="simulated">{t("mock")}</ProvenanceChip>
            )}
            <span className="num text-sm text-n600">
              {s.series.ticker} · {s.series.isin}
            </span>
          </div>
          <h1 className="mt-3 max-w-3xl text-title font-extrabold tracking-tight text-balance">
            {t("title", { ticker: s.series.ticker })}
          </h1>
          <p className="mt-2 max-w-[62ch] text-n700">
            {t.rich("lead", {
              s: s.clock.daySecs,
              clock: (c) => <GlossaryTerm term="demoClock">{c}</GlossaryTerm>,
            })}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <Link
              href={s.links.bond}
              className="whitespace-nowrap font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
            >
              {t("bondPage")}
            </Link>
            <span className="inline-flex items-center gap-x-3 whitespace-nowrap">
              <Link
                href="/sandbox/new?fresh=1"
                className="font-semibold text-n700 hover:text-n900"
              >
                {t("restart")}
              </Link>
              <HelpMenu role="sandbox" />
            </span>
          </div>
        </div>
        <ClockCard s={s} skew={skew} locale={locale} />
      </div>

      {stale && (
        <p
          role="status"
          className="mt-4 rounded-btn border border-dashed border-warn-bd bg-warn-bg px-3 py-2 text-sm text-warn-fg"
        >
          {t("stale")}
        </p>
      )}

      {/* ---------- now ---------- */}
      <div className="mt-6" data-tour="now">
        <NowBar
          tone={nb.tone}
          title={t(`now.${nb.key}`, nb.values ?? {})}
          detail={nowDetail}
          clock={
            nb.clock ? (
              <CountdownClock
                to={toClient(nb.clock.at)}
                label={t(`clock.${nb.clock.key}`)}
                daySecs={s.clock.daySecs}
              />
            ) : undefined
          }
          actors={actor && !closed ? [actor] : []}
          action={nb.action}
        />
      </div>

      <div className="mt-6" data-tour="rail">
        <LifecycleRail locale={locale} nodes={rail} />
      </div>

      <section
        data-tour="steps"
        className="mt-6 rounded-card border border-n200 bg-n0 p-4 sm:p-5"
      >
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-bold">
            {a
              ? t("flowTitle", { action: actionName(a) })
              : t("flowEmptyTitle")}
          </h2>
          {a && <span className="num text-xs text-n500">{a.corpId}</span>}
        </div>
        {a ? (
          <ActionFlow steps={flow} locale={locale} dateOnly />
        ) : (
          <p className="rounded-btn border border-dashed border-n300 px-4 py-6 text-center text-sm text-n600">
            {t("flowEmpty")}
          </p>
        )}
      </section>

      {/* Preflight #11: the story (what happened, step by step) comes before the toys — the scenario
          cards used to push the coupon's progress below the second screen. */}
      <section data-tour="scenario" aria-labelledby="sbx-try" className="mt-6">
        <h2 id="sbx-try" className="text-lg font-bold">
          {t("try.title")}
        </h2>
        <p className="mt-1 max-w-[62ch] text-sm text-n600">{t("try.lead")}</p>
        <Scenarios
          s={s}
          a={a}
          busy={busy}
          error={scenarioError}
          onRun={run}
          locale={locale}
        />
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div data-tour="money" className="min-w-0 space-y-6">
          <Register s={s} a={a} locale={locale} name={name} />
          {showMoney && mf && a && (
            <MoneyFlow
              currency={mf.currency}
              locale={locale}
              title={t("moneyTitle", { action: actionName(a) })}
              issuer={{
                label: t("issuerOf", { ticker: s.series.ticker }),
                address: s.series.issuer,
              }}
              escrow={mf.escrow}
              recipients={recipients}
              state={
                a.status === "Defaulted"
                  ? "defaulted"
                  : a.curedAt
                    ? "cured"
                    : "normal"
              }
            />
          )}
        </div>

        <aside className="min-w-0 space-y-6 self-start lg:sticky lg:top-24">
          <section
            data-tour="roles"
            className="rounded-card border border-n200 bg-n0 p-4 sm:p-5"
          >
            <Segmented
              label={t("viewAs")}
              value={role}
              options={ROLES.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
              onChange={setRole}
            />
            <RoleCard
              role={role}
              s={s}
              a={a}
              locale={locale}
              claim={claim}
              name={name}
              onCure={() => run("cure")}
              busy={busy}
            />
          </section>
          <div data-tour="feed">
            <Feed
              s={s}
              skew={skew}
              name={name}
              actionName={(pda) =>
                actionName(s.actions.find((x) => x.pda === pda))
              }
              locale={locale}
            />
          </div>
        </aside>
      </div>

      <Tour role="sandbox" />
    </div>
  );
}

/** 404 from the registrar: expired (24 h) or never existed. */
export function Gone() {
  const t = useTranslations("sandbox.gone");
  return (
    <div
      className={cx(
        "mx-auto max-w-xl rounded-card border border-dashed border-n300 bg-n0 p-8 text-center",
      )}
    >
      <h1 className="text-title font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-2 text-n700">{t("body")}</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/sandbox/new?fresh=1">{t("cta")}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/bonds">{t("bonds")}</Link>
        </Button>
      </div>
    </div>
  );
}
