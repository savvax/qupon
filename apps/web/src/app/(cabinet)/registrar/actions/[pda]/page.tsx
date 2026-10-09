import { Pulse } from "@/components/motion/Pulse";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { toLocale } from "@/i18n/locale";
import type { ReactNode } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Kpi } from "@/components/ui/Kpi";
import { ActionFlow, type FlowStep } from "@/components/ui/ActionFlow";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { NowBar } from "@/components/ui/NowBar";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import {
  buildTimeline,
  nextStep,
  paidTxByOwner,
  STEP_ACTOR,
  type StepId,
} from "@/lib/actionFlow";
import { moneyFlowOf } from "@/lib/moneyFlow";
import {
  getAction,
  getKaseCheck,
  getNoticeText,
  getSeries,
  listActivity,
  listEntitlements,
  seev031Url,
  seev036Url,
  seev036ZipUrl,
  type EntitlementDTO,
} from "@/lib/api";
import { bpsToPercent, formatDate, formatDateTime } from "@/lib/format";
import { KIND_TONE } from "@/lib/ui/badge";
import { cx } from "@/lib/ui/cx";
import { Countdown } from "./Countdown";
import { NoticePanel } from "./NoticePanel";
import { DisclosurePanel } from "./DisclosurePanel";
import { KaseCheckPanel } from "./KaseCheckPanel";
import { ReconcilePanel } from "./ReconcilePanel";
import { StepButton } from "./StepButton";
import { metaTitle } from "@/lib/meta";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  return { title: await metaTitle("registrarActions") };
}

function Panel({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx("rounded-card border border-n200 bg-n0 p-5", className)}
    >
      <h3 className="font-bold">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-n100">
      <div
        className={cx("qp-bar h-full rounded-full", tone)}
        style={{ scale: `${Math.max(0, Math.min(pct, 100)) / 100} 1` }}
      />
    </div>
  );
}

const pctOf = (part: bigint, whole: bigint) =>
  whole > 0n ? Number((part * 10000n) / whole) / 100 : 0;

export default async function RegistrarActionPage({
  params,
}: {
  params: Promise<{ pda: string }>;
}) {
  const { pda } = await params;
  const action = await getAction(pda).catch((e: unknown) => {
    const status = (e as { status?: number } | null)?.status;
    if (status === 404 || status === 400) notFound();
    throw e;
  });
  const [series, entitlements, activity, noticeEn, noticeRu, kaseCheck] =
    await Promise.all([
      getSeries(action.seriesMint).catch(() => null),
      listEntitlements(pda).catch(() => [] as EntitlementDTO[]),
      listActivity(200),
      getNoticeText(pda, "en").catch(() => "notice unavailable"),
      getNoticeText(pda, "ru").catch(() => "уведомление недоступно"),
      // kase.kz outages degrade the card, never the page
      getKaseCheck(pda).catch(() => null),
    ]);
  const locale = toLocale(await getLocale());
  const [t, ts, tk, tstep, tt, tm] = await Promise.all([
    getTranslations("action"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
    getTranslations("steps"),
    getTranslations("trades"),
    getTranslations("kit.money"),
  ]);

  const timeline = buildTimeline(action, activity, series?.status === "Closed");
  // the sweep step joins the timeline only when its activity row exists (task 1414)
  const ids = timeline.map((s) => s.id);
  const next = nextStep(
    action,
    Date.now(),
    // finalize_snapshot needs units == supply, not a holder count (executor.NextStep):
    // zero-balance investors are skipped by the snapshot, so counting them never settles
    series ? BigInt(series.totalIssued) : undefined,
    series?.openTrades ?? 0,
  );
  // Batch counters move while the status holds (snapshot/pay/retire land in batches): StepButton ends its
  // post-success wait when this key changes (task 1423).
  const progress = `${action.unitsSnapshotted ?? "-"}|${action.holdersPaid ?? "-"}|${action.holdersRetired ?? "-"}`;
  // open secondary trades block the record date (TradesInFlight): say so and link the page that clears them
  const tradesWait = action.status === "Announced" && !next.step;
  const paidTx = paidTxByOwner(activity, pda);
  const label = (id: StepId) => tstep(`do.${id}`);
  const status = (s: string) => (
    <Badge status={s}>{ts.has(s) ? ts(s) : s}</Badge>
  );
  const money = (a?: { minor: string; currency: string } | null) =>
    a ? (
      <Amount minor={a.minor} currency={a.currency} locale={locale} />
    ) : (
      <span className="text-n400">—</span>
    );

  // Escrow must hold Σ net + tax + principal (the DTO has no principal total; complete_action asserts the same sum).
  const isCash = action.kind !== "BMET" && action.kind !== "CHAN";
  const currency = action.totalNet?.currency ?? action.perUnitGross.currency;
  const principalTotal = entitlements.reduce(
    (acc, e) => acc + BigInt(e.principal?.minor ?? "0"),
    0n,
  );
  const required =
    BigInt(action.totalNet?.minor ?? "0") +
    BigInt(action.totalTax?.minor ?? "0") +
    (isCash ? principalTotal : 0n);
  const escrow = BigInt(action.escrowBalance?.minor ?? "0");
  const funded = isCash && required > 0n && escrow >= required;
  const paidOut =
    !funded && ["Settling", "Completed", "Retiring"].includes(action.status);
  const holders = action.holdersSnapshotted ?? 0;

  const waitText = tradesWait
    ? tt("wait.open", { count: series?.openTrades ?? 0 })
    : action.status === "VotingOpen"
      ? t("wait.voting")
      : action.status === "Finalized"
        ? t("wait.notApproved")
        : action.status === "Completed"
          ? t("wait.completed")
          : action.status === "Cancelled"
            ? t("wait.cancelled")
            : next.wait;

  const votes = {
    for: BigInt(action.votesFor ?? "0"),
    against: BigInt(action.votesAgainst ?? "0"),
    abstain: BigInt(action.votesAbstain ?? "0"),
  };
  const snapUnits = BigInt(action.unitsSnapshotted ?? "0");

  const facts: [string, ReactNode][] = [
    [
      t("facts.corpId"),
      <span key="c" className="num">
        {action.corpId}
      </span>,
    ],
    [
      t("facts.coaf"),
      <span key="o" className="num">
        {action.officialId || "—"}
      </span>,
    ],
    [
      t("facts.record"),
      <span key="r" className="num">
        {formatDateTime(action.recordAt, locale)}
      </span>,
    ],
    [
      t("facts.payment"),
      <span key="p" className="num">
        {formatDateTime(action.paymentAt, locale)}
      </span>,
    ],
  ];
  if (action.periodStart && action.periodEnd)
    facts.push([
      t("facts.period"),
      <span key="pe" className="num">
        {formatDate(`${action.periodStart}T00:00:00+05:00`, locale)} –{" "}
        {formatDate(`${action.periodEnd}T00:00:00+05:00`, locale)} ·{" "}
        {t("facts.days", { n: action.accrualDays ?? 0 })}
        {action.rateBps != null && ` · ${bpsToPercent(action.rateBps, locale)}`}
      </span>,
    ]);
  if (action.snapshotSlot != null)
    facts.push([
      t("facts.snapshot"),
      <span key="s" className="num">
        {t("facts.snapshotValue", {
          slot: action.snapshotSlot,
          units: action.unitsSnapshotted ?? "0",
          holders,
        })}
      </span>,
    ]);

  const hasPrincipal = principalTotal > 0n;
  const meetingCols: Column<EntitlementDTO>[] = [
    {
      key: "owner",
      header: t("ent.owner"),
      render: (e) => <Address value={e.owner} />,
    },
    {
      key: "units",
      header: t("ent.units"),
      align: "right",
      render: (e) => <span className="num">{e.units}</span>,
    },
    {
      key: "vote",
      header: t("ent.vote"),
      render: (e) =>
        e.vote && e.vote !== "None" ? (
          status(e.vote)
        ) : (
          <span className="text-n400">{t("ent.notVoted")}</span>
        ),
    },
    {
      key: "votedAt",
      header: t("ent.votedAt"),
      hideBelow: "md",
      render: (e) =>
        e.votedAt ? (
          <span className="num">{formatDateTime(e.votedAt, locale)}</span>
        ) : (
          "—"
        ),
    },
  ];
  const entCols: Column<EntitlementDTO>[] = [
    {
      key: "owner",
      header: t("ent.owner"),
      render: (e) => <Address value={e.owner} />,
    },
    {
      key: "units",
      header: t("ent.units"),
      align: "right",
      render: (e) => <span className="num">{e.units}</span>,
    },
    {
      key: "gross",
      header: t("ent.gross"),
      align: "right",
      hideBelow: "lg",
      render: (e) => money(e.gross),
    },
    {
      key: "tax",
      header: t("ent.tax"),
      align: "right",
      hideBelow: "md",
      render: (e) => money(e.tax),
    },
    {
      key: "net",
      header: t("ent.net"),
      align: "right",
      render: (e) => money(e.net),
    },
    {
      key: "principal",
      header: t("ent.principal"),
      align: "right",
      hideBelow: "md",
      render: (e) =>
        e.principal && BigInt(e.principal.minor) > 0n ? (
          money(e.principal)
        ) : (
          <span className="text-n400">—</span>
        ),
    },
    { key: "status", header: t("ent.status"), render: (e) => status(e.status) },
    {
      key: "tx",
      header: t("ent.tx"),
      hideBelow: "md",
      render: (e) =>
        paidTx.get(e.owner) ? (
          <Address value={paidTx.get(e.owner)!} kind="tx" />
        ) : (
          <span className="text-n400">—</span>
        ),
    },
    {
      key: "iso",
      header: "seev.036",
      hideBelow: "lg",
      render: (e) => (
        <a
          href={seev036Url(e.pda)}
          className="font-semibold text-g700 hover:underline"
        >
          XML
        </a>
      ),
    },
  ];

  // ActionFlow: the timeline with who may push each step, planned vs effective record time and the ISO files.
  const flowSteps: FlowStep[] = timeline.map((st, i) => ({
    id: `${ids[i]}-${i}`,
    label: tstep(`done.${ids[i]}`),
    state:
      st.state === "failed"
        ? "failed"
        : st.state === "done"
          ? "done"
          : st.state === "current" && action.status !== "Cancelled"
            ? "current"
            : action.status === "Cancelled"
              ? "skipped"
              : "pending",
    at: st.at,
    tx: st.signature,
    actor: STEP_ACTOR[ids[i]!],
    detail: st.detail
      ? tstep(`detail.${st.detail.key}`, st.detail.values)
      : undefined,
    record:
      ids[i] === "strike"
        ? {
            planned: action.recordAt,
            effective: st.state === "done" ? st.at : null,
          }
        : undefined,
    downloads:
      ids[i] === "announce"
        ? [{ label: "seev.031", href: seev031Url(pda) }]
        : isCash && ids[i] === "complete" && st.state === "done"
          ? [{ label: "seev.036", href: seev036ZipUrl(pda) }]
          : undefined,
  }));
  const flow = moneyFlowOf(action, entitlements, activity, (u) =>
    tm("holderSub", { units: u }),
  );
  const nowTitle: ReactNode = next.step ? (
    t("now.next", { step: label(next.step) })
  ) : action.status === "Completed" && isCash ? (
    <>
      {t("now.paidOut")} {money(action.totalPaid)} ·{" "}
      {t("now.holders", { count: action.holdersPaid ?? holders })}
    </>
  ) : action.status === "Completed" ? (
    t("now.done")
  ) : (
    waitText
  );
  const nowDetail: ReactNode = tradesWait ? (
    <Link
      href={`/registrar/trades?mint=${action.seriesMint}`}
      className="text-g700 underline underline-offset-2"
    >
      {tt("wait.link")}
    </Link>
  ) : next.step === "apply" ? (
    <ProvenanceChip kind="simulated">{t("simulatedArdfm")}</ProvenanceChip>
  ) : next.step ? (
    waitText
  ) : undefined;

  const factsAndReconcile = (
    <div className="grid gap-6 xl:grid-cols-2">
      <Panel title={t("facts.title")}>
        <dl className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
          {facts.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-xs font-semibold text-n500">{k}</dt>
              <dd className="text-sm break-words text-n900">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
      <ReconcilePanel pda={pda} />
    </div>
  );

  return (
    <div className="mx-auto max-w-[1200px]">
      <nav className="text-sm text-n500">
        <Link
          href="/registrar/actions"
          className="font-semibold text-g700 hover:underline"
        >
          {t("breadcrumb")}
        </Link>
        {series && (
          <>
            <span className="mx-1.5">›</span>
            <Link href={`/bonds/${series.mint}`} className="hover:underline">
              {series.ticker}
            </Link>
          </>
        )}
      </nav>

      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-extrabold tracking-tight">
              {tk.has(action.kind) ? tk(action.kind) : action.kind}
              {series && <span className="text-n500"> · {series.ticker}</span>}
            </h1>
            <Badge tone={KIND_TONE[action.kind] ?? "neutral"}>
              {action.kind}
            </Badge>
            <Pulse trigger={action.status}>{status(action.status)}</Pulse>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-n600">
            <span className="num">{action.corpId}</span>
            <Address value={action.pda} />
          </div>
        </div>
      </div>

      <div className="mt-5">
        <NowBar
          dock="tabbar"
          tone={
            action.status === "Completed"
              ? "done"
              : action.status === "Cancelled"
                ? "attention"
                : "default"
          }
          title={nowTitle}
          detail={nowDetail}
          clock={
            action.status === "VotingOpen" && action.votingEndsAt ? (
              <Countdown endsAt={action.votingEndsAt} />
            ) : undefined
          }
          actors={next.step ? [STEP_ACTOR[next.step]] : []}
          action={
            next.step ? (
              <span className="flex flex-wrap gap-2">
                {action.status === "RecordStruck" &&
                  holders > 0 &&
                  next.step === "snapshot" && (
                    <StepButton
                      pda={pda}
                      label={label("finalize")}
                      status={action.status}
                      progress={progress}
                      secondary
                    />
                  )}
                <StepButton
                  pda={pda}
                  label={label(next.step)}
                  status={action.status}
                  progress={progress}
                />
              </span>
            ) : undefined
          }
        />
      </div>

      <section className="mt-5 rounded-card border border-n200 bg-n0 p-4 sm:p-5">
        <h2 className="mb-4 text-base font-bold">{t("timeline")}</h2>
        <ActionFlow steps={flowSteps} locale={locale} />
      </section>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {action.kind === "BMET" ? (
          <div className="col-span-2 lg:col-span-1">
            <Kpi
              label={t("kpi.proposal")}
              value={
                <span className="num">
                  {`${series ? bpsToPercent(series.couponRateBps, locale) : "—"} → ${
                    action.proposalNewRateBps != null
                      ? bpsToPercent(action.proposalNewRateBps, locale)
                      : "—"
                  }`}
                </span>
              }
            />
          </div>
        ) : (
          <Kpi label={t("kpi.perBond")} value={money(action.perUnitGross)} />
        )}
        {isCash ? (
          <Kpi
            label={t("kpi.escrow")}
            value={money(action.escrowBalance)}
            hint={
              funded
                ? t("funding.funded")
                : paidOut
                  ? t("funding.paidOut")
                  : required === 0n
                    ? t("funding.awaiting")
                    : t("funding.under")
            }
          />
        ) : (
          <Kpi
            label={t("kpi.turnout")}
            value={
              <span className="num">
                {pctOf(
                  votes.for + votes.against + votes.abstain,
                  snapUnits,
                ).toFixed(1)}
                %
              </span>
            }
          />
        )}
        <Kpi
          label={t("kpi.holders")}
          value={<span className="num">{holders}</span>}
          hint={
            isCash && holders > 0
              ? t("kpi.paidOf", {
                  paid: action.holdersPaid ?? 0,
                  total: holders,
                })
              : undefined
          }
        />
        <Kpi
          label={t("kpi.record")}
          value={
            <span className="num">{formatDate(action.recordAt, locale)}</span>
          }
        />
      </div>

      {isCash && entitlements.length > 0 && (
        <MoneyFlow
          className="mt-8"
          currency={flow.currency}
          locale={locale}
          issuer={{
            label: series?.ticker ?? "—",
            address: series?.issuer ?? undefined,
          }}
          escrow={flow.escrow}
          recipients={flow.recipients}
        />
      )}
      <section className="mt-8">
        <h2 className="mb-3 text-lg font-bold">
          {action.kind === "BMET" ? t("ent.holders") : t("ent.title")}{" "}
          <span className="text-n500">({entitlements.length})</span>
        </h2>
        <DataTable
          columns={
            action.kind === "BMET"
              ? meetingCols
              : entCols.filter((c) => c.key !== "principal" || hasPrincipal)
          }
          rows={entitlements}
          rowKey={(e) => e.pda}
          empty={t("ent.empty")}
        />
      </section>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">{factsAndReconcile}</div>

        <aside className="min-w-0 space-y-4">
          {isCash && (
            <Panel title={t("funding.title")}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-n600">{t("funding.escrow")}</span>
                <span
                  className={cx(
                    "font-semibold",
                    funded || paidOut
                      ? "text-g700"
                      : required === 0n
                        ? "text-n500"
                        : "text-warn-fg",
                  )}
                >
                  {funded
                    ? t("funding.funded")
                    : paidOut
                      ? t("funding.paidOut")
                      : required === 0n
                        ? t("funding.awaiting")
                        : t("funding.under")}
                </span>
              </div>
              <div className="mt-2">
                <Bar
                  pct={paidOut ? 100 : pctOf(escrow, required)}
                  tone={funded || paidOut ? "bg-g500" : "bg-[#d99a1e]"}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                {money(action.escrowBalance)}
                <span className="text-n500">
                  / {money({ minor: required.toString(), currency })}
                </span>
              </div>
              <p className="mt-2 text-xs text-n500">
                {principalTotal > 0n
                  ? t("funding.ruleWithPrincipal")
                  : t("funding.rule")}
              </p>
              {action.escrow && (
                <div className="mt-2 text-xs">
                  <Address value={action.escrow} />
                </div>
              )}
            </Panel>
          )}

          {action.kind === "BMET" && (
            <Panel title={t("meeting.title")}>
              <p className="text-sm text-n700">
                {t("meeting.proposal")}{" "}
                <span className="num font-semibold">
                  {series ? bpsToPercent(series.couponRateBps, locale) : "—"}
                </span>{" "}
                <span className="text-n400">→</span>{" "}
                <span className="num font-semibold text-g700">
                  {action.proposalNewRateBps != null
                    ? bpsToPercent(action.proposalNewRateBps, locale)
                    : "—"}
                </span>
              </p>
              <div className="mt-4 space-y-3">
                {(
                  [
                    ["for", votes.for, "bg-g500"],
                    ["against", votes.against, "bg-err-fg"],
                    ["abstain", votes.abstain, "bg-n400"],
                  ] as const
                ).map(([k, units, tone]) => (
                  <div key={k}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-n700">
                        {t(`meeting.${k}`)}
                      </span>
                      <span className="num text-n600">
                        {units.toString()} ·{" "}
                        {pctOf(units, snapUnits).toFixed(1)}%
                      </span>
                    </div>
                    <div className="mt-1">
                      <Bar pct={pctOf(units, snapUnits)} tone={tone} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs text-n500">
                {t("meeting.thresholds", {
                  quorum: series ? series.quorumBps / 100 : "—",
                  approval: series ? series.approvalBps / 100 : "—",
                })}
              </p>
              {action.votingEndsAt && (
                <p className="mt-1 text-xs text-n500">
                  {t("meeting.ends", {
                    at: formatDateTime(action.votingEndsAt, locale),
                  })}{" "}
                  · <Countdown endsAt={action.votingEndsAt} />
                </p>
              )}
              {action.result && action.result !== "Pending" && (
                <div className="mt-3">{status(action.result)}</div>
              )}
            </Panel>
          )}

          {/* coupon/redemption-only cards: a meeting has no KASE schedule check, payout confirmations or notice */}
          {isCash && <KaseCheckPanel check={kaseCheck} />}

          <DisclosurePanel pda={pda} />

          <Panel title={t("downloads.title")}>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href={seev031Url(pda)}
                  className="font-semibold text-g700 hover:underline"
                >
                  seev.031
                </a>{" "}
                <span className="text-n600">— {t("downloads.seev031")}</span>
              </li>
              {isCash && (
                <li>
                  <a
                    href={seev036ZipUrl(pda)}
                    className="font-semibold text-g700 hover:underline"
                  >
                    seev.036 (ZIP)
                  </a>{" "}
                  <span className="text-n600">— {t("downloads.seev036")}</span>
                </li>
              )}
            </ul>
            <div className="mt-3">
              <Badge tone="neutral">{t("downloads.simulated")}</Badge>
            </div>
          </Panel>

          {isCash && <NoticePanel en={noticeEn} ru={noticeRu} />}
        </aside>
      </div>
    </div>
  );
}
