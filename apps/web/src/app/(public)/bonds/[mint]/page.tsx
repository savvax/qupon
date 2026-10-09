import Link from "next/link";
import { Icon } from "@/components/shell/icons";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Kpi } from "@/components/ui/Kpi";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { DemoAsButton } from "@/components/shell/DemoAsButton";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { LifecycleRail, type RailNode } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { NowBar } from "@/components/ui/NowBar";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { Tabs } from "@/components/ui/Tabs";
import { almatyToday, couponGross, days30E360 } from "@/lib/accrual";
import { nextStep, paidTxByOwner, STEP_ACTOR } from "@/lib/actionFlow";
import {
  getSchedule,
  getSeries,
  listActions,
  listActivity,
  listEntitlements,
  listSeriesDocuments,
  seriesDocumentUrl,
  type ActionDTO,
  type EntitlementDTO,
  type ScheduleItem,
} from "@/lib/api";
import { bpsToPercent, formatDate, formatDateTime } from "@/lib/format";
import { getKaseSeriesTicker } from "@/lib/kase";
import { moneyFlowOf } from "@/lib/moneyFlow";
import { getNetwork } from "@/lib/network";
import { type AuditRow, ExportAuditButton } from "./ExportAuditButton";
import { KasePanel } from "./KasePanel";
import { type RegisterSet, RegisterPanel } from "./RegisterPanel";
import { YieldBlock } from "./YieldBlock";
import { toLocale } from "@/i18n/locale";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const t = await getTranslations("meta");
  const s = await getSeries(mint).catch(() => null);
  return {
    title: s ? t("bond", { ticker: s.ticker, isin: s.isin }) : t("bonds"),
  };
}

const FREQ_KEY: Record<number, string> = {
  1: "freqAnnual",
  2: "freqSemiAnnual",
  4: "freqQuarterly",
  12: "freqMonthly",
};
const DAY_COUNT: Record<string, string> = {
  THIRTY_360: "30E/360",
  ACT_365: "ACT/365",
  ACT_ACT: "ACT/ACT",
};

export default async function BondPage({
  params,
  searchParams,
}: {
  params: Promise<{ mint: string }>;
  searchParams: Promise<{ tab?: string; rec?: string }>;
}) {
  const { mint } = await params;
  // ?tab=actions|terms opens that tab (links from the issuer cabinet); ?rec=<action> picks the register date
  const { tab, rec } = await searchParams;
  const series = await getSeries(mint).catch((e: unknown) => {
    // Unknown or malformed mint → 404 (ApiError in production, Api404 in mock mode: both carry .status).
    const status = (e as { status?: number } | null)?.status;
    if (status === 404 || status === 400) notFound();
    throw e;
  });
  const [schedule, actions, documents, allActivity, network] =
    await Promise.all([
      getSchedule(mint).catch(() => [] as ScheduleItem[]),
      listActions(mint).catch(() => [] as ActionDTO[]),
      listSeriesDocuments(mint),
      listActivity(200),
      getNetwork(),
    ]);
  // entitlements of every action that has a snapshot: the register per record date and the money flow
  const snapped = actions.filter((a) => (a.holdersSnapshotted ?? 0) > 0);
  const ents = new Map<string, EntitlementDTO[]>(
    await Promise.all(
      snapped.map(
        async (a) =>
          [a.pda, await listEntitlements(a.pda).catch(() => [])] as const,
      ),
    ),
  );
  const locale = toLocale(await getLocale());
  // Series linked in series_settings to a KASE ticker get the market panel; failures never block the page.
  const kaseTicker = await getKaseSeriesTicker(mint);
  const [t, ts, tk, tDoc, tm] = await Promise.all([
    getTranslations("bond"),
    getTranslations("status"),
    getTranslations("landing.kinds"),
    getTranslations("org.publicDocs"),
    getTranslations("kit.money"),
  ]);
  const freq = FREQ_KEY[series.frequency]
    ? t(FREQ_KEY[series.frequency]!)
    : `${series.frequency}×`;
  const money = (a?: { minor: string; currency: string } | null) =>
    a ? <Amount minor={a.minor} currency={a.currency} locale={locale} /> : "—";
  const status = (s: string) => (
    <Badge status={s}>{ts.has(s) ? ts(s) : s}</Badge>
  );

  const scheduleCols: Column<ScheduleItem>[] = [
    {
      key: "n",
      header: "#",
      render: (r) => <span className="num">{r.couponNumber}</span>,
    },
    {
      key: "period",
      header: t("cols.period"),
      hideBelow: "md",
      render: (r) =>
        r.periodStart && r.periodEnd ? (
          <span className="num">
            {formatDate(r.periodStart, locale)} –{" "}
            {formatDate(r.periodEnd, locale)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "record",
      header: t("cols.record"),
      render: (r) => (
        <span className="num">{formatDate(r.recordDate, locale)}</span>
      ),
    },
    {
      key: "payment",
      header: t("cols.payment"),
      render: (r) => (
        <span className="num">{formatDate(r.paymentDate, locale)}</span>
      ),
    },
    {
      key: "perUnit",
      header: t("cols.perUnit"),
      align: "right",
      render: (r) => money(r.amountPerUnit),
    },
    {
      key: "status",
      header: t("cols.status"),
      render: (r) => status(r.status),
    },
  ];

  const actionCols: Column<ActionDTO>[] = [
    {
      key: "id",
      header: t("cols.action"),
      render: (a) => (
        <span>
          <span className="num font-semibold text-n900">{a.corpId}</span>
          <span className="mt-0.5 block text-xs text-n500">
            {a.kind} · {tk.has(a.kind) ? tk(a.kind) : a.kind}
          </span>
        </span>
      ),
    },
    {
      key: "record",
      header: t("cols.record"),
      hideBelow: "md",
      render: (a) => (
        <span className="num">{formatDate(a.recordAt, locale)}</span>
      ),
    },
    {
      key: "payment",
      header: t("cols.payment"),
      render: (a) => (
        <span className="num">{formatDate(a.paymentAt, locale)}</span>
      ),
    },
    {
      key: "perUnit",
      header: t("cols.perUnit"),
      align: "right",
      render: (a) => (a.kind === "BMET" ? "—" : money(a.perUnitGross)),
    },
    {
      key: "status",
      header: t("cols.status"),
      render: (a) => status(a.status),
    },
    {
      key: "account",
      header: t("cols.account"),
      hideBelow: "lg",
      render: (a) => <Address value={a.pda} />,
    },
  ];

  const terms: [string, React.ReactNode][] = [
    [
      t("terms.isin"),
      <span key="isin" className="num">
        {series.isin}
      </span>,
    ],
    [t("terms.mint"), <Address key="mint" value={series.mint} />],
    [
      t("terms.cash"),
      <Address
        key="cash"
        value={series.cashMint}
        label={series.faceValue.currency}
      />,
    ],
    [t("terms.face"), money(series.faceValue)],
    [
      t("terms.rate"),
      <span key="rate" className="num">
        {bpsToPercent(series.couponRateBps, locale)}
      </span>,
    ],
    [t("terms.frequency"), freq],
    [t("terms.dayCount"), DAY_COUNT[series.dayCount] ?? series.dayCount],
    [
      t("terms.issue"),
      <span key="issue" className="num">
        {formatDate(series.issueDate, locale)}
      </span>,
    ],
    [
      t("terms.maturity"),
      <span key="mat" className="num">
        {formatDate(series.maturityDate, locale)}
      </span>,
    ],
    [
      t("terms.quorum"),
      <span key="q" className="num">
        {bpsToPercent(series.quorumBps, locale)}
      </span>,
    ],
    [
      t("terms.approval"),
      <span key="a" className="num">
        {bpsToPercent(series.approvalBps, locale)}
      </span>,
    ],
    ...(series.issuer
      ? [
          [t("terms.issuer"), <Address key="iss" value={series.issuer} />] as [
            string,
            React.ReactNode,
          ],
        ]
      : []),
    ...(series.registrar
      ? [
          [
            t("terms.registrar"),
            <Address key="reg" value={series.registrar} />,
          ] as [string, React.ReactNode],
        ]
      : []),
  ];

  // ── the bond's life story ──
  const CASH = ["INTR", "REDM", "MCAL", "PCAL"];
  const pdas = new Set(actions.map((a) => a.pda));
  const activity = allActivity
    .filter((ev) => pdas.has(ev.actionPda ?? ev.action_pda ?? ""))
    .sort((a, b) => b.ts - a.ts);
  const txCount = (pda: string) =>
    new Set(
      activity
        .filter((ev) => (ev.actionPda ?? ev.action_pda) === pda)
        .map((ev) => ev.sig),
    ).size;
  const day = (ymd: string) =>
    ymd.length > 10 ? ymd : `${ymd}T00:00:00+05:00`;
  const railStatus = (a?: ActionDTO): RailNode["status"] | undefined =>
    !a
      ? undefined
      : a.status === "Completed" || a.status === "Finalized"
        ? "done"
        : a.status === "Cancelled"
          ? "cancelled"
          : "live";
  const matured = series.maturityDate.slice(0, 10);
  const rail: RailNode[] = [
    {
      id: "issue",
      kind: "issue" as const,
      title: t("rail.issue"),
      date: day(series.issueDate),
      status: "done" as const,
      statusLabel: t("rail.placed"),
    },
    ...schedule.map((item, i): RailNode => {
      const a =
        actions.find((x) => x.pda === item.actionPda) ??
        actions.find(
          (x) =>
            CASH.includes(x.kind) &&
            x.periodEnd &&
            x.periodEnd === item.periodEnd,
        );
      const last =
        i === schedule.length - 1 && item.paymentDate.slice(0, 10) === matured;
      return {
        id: `c${item.couponNumber}`,
        kind: last ? "maturity" : "coupon",
        title: t(last ? "rail.couponMaturity" : "rail.coupon", {
          n: item.couponNumber,
        }),
        date: item.paymentDate,
        status:
          railStatus(a) ?? (item.status === "Completed" ? "done" : "upcoming"),
        amount: item.amountPerUnit,
        txCount: a ? txCount(a.pda) : undefined,
        href:
          a && (a.holdersSnapshotted ?? 0) > 0
            ? `?rec=${a.pda}#register`
            : undefined,
      };
    }),
    ...actions
      .filter((a) => a.kind === "BMET" || a.kind === "CHAN")
      .map((a): RailNode => ({
        id: a.pda,
        kind: "meeting",
        title: t("rail.meeting"),
        date: a.recordAt,
        status: railStatus(a)!,
        statusLabel: ts.has(a.status) ? ts(a.status) : a.status,
        note:
          a.proposalNewRateBps != null
            ? `${bpsToPercent(series.couponRateBps, locale)} → ${bpsToPercent(a.proposalNewRateBps, locale)}`
            : undefined,
        txCount: txCount(a.pda),
        href: `?rec=${a.pda}#register`,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  // ── Now: the one thing that happens next ──
  const live = actions.find(
    (a) => !["Completed", "Cancelled", "Finalized"].includes(a.status),
  );
  const upcoming = schedule.find(
    (s) =>
      s.status === "Projected" && new Date(s.recordDate).getTime() > Date.now(),
  );
  const kindName = (k: string) => (tk.has(k) ? tk(k) : k);
  const demo = network.demoLogin;
  let now: React.ReactNode;
  if (live?.kind === "BMET" && live.status === "VotingOpen") {
    now = (
      <NowBar
        title={t("now.voting", {
          proposal:
            live.proposalNewRateBps != null
              ? `${bpsToPercent(series.couponRateBps, locale)} → ${bpsToPercent(live.proposalNewRateBps, locale)}`
              : live.corpId,
        })}
        detail={t("now.who")}
        clock={
          live.votingEndsAt ? (
            <CountdownClock to={live.votingEndsAt} label={t("now.clockVote")} />
          ) : undefined
        }
        actors={["holder"]}
        action={
          demo ? (
            <DemoAsButton role="investor" next="/investor/meetings">
              {t("now.voteAs")}
            </DemoAsButton>
          ) : undefined
        }
      />
    );
  } else if (live) {
    const step = nextStep(live, Date.now(), BigInt(series.totalIssued)).step;
    now = (
      <NowBar
        title={t("now.inProgress", {
          title: `${kindName(live.kind)} ${live.corpId}`,
          status: ts.has(live.status) ? ts(live.status) : live.status,
        })}
        detail={t("now.who")}
        actors={step ? [STEP_ACTOR[step]] : []}
        action={
          demo ? (
            <DemoAsButton
              role="registrar"
              next={`/registrar/actions/${live.pda}`}
            >
              {t("now.runAs")}
            </DemoAsButton>
          ) : undefined
        }
      />
    );
  } else if (upcoming) {
    now = (
      <NowBar
        title={t("now.next", {
          title: t("rail.coupon", { n: upcoming.couponNumber }),
          record: formatDate(upcoming.recordDate, locale),
          payment: formatDate(upcoming.paymentDate, locale),
        })}
        clock={
          <CountdownClock
            to={upcoming.recordDate}
            label={t("now.clockRecord")}
          />
        }
        actors={["registrar"]}
        action={
          demo ? (
            <DemoAsButton role="registrar" next="/registrar/actions">
              {t("now.runAs")}
            </DemoAsButton>
          ) : undefined
        }
      />
    );
  } else {
    now = (
      <NowBar
        tone="done"
        title={series.status === "Closed" ? t("now.matured") : t("now.none")}
      />
    );
  }

  // ── money, register, journal, yield ──
  const lastPaid = actions
    .filter(
      (a) =>
        CASH.includes(a.kind) &&
        a.status === "Completed" &&
        ents.get(a.pda)?.length,
    )
    .sort((a, b) =>
      (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
    )[0];
  const flow = lastPaid
    ? moneyFlowOf(lastPaid, ents.get(lastPaid.pda) ?? [], activity, (u) =>
        tm("holderSub", { units: u }),
      )
    : null;
  const paidToHolders = actions
    .filter((a) => CASH.includes(a.kind))
    .reduce((acc, a) => acc + BigInt(a.totalPaid?.minor ?? "0"), 0n);
  const registerSets: RegisterSet[] = snapped
    .filter((a) => ents.get(a.pda)?.length)
    .sort((a, b) => b.recordAt.localeCompare(a.recordAt))
    .map((a) => {
      const paidTx = paidTxByOwner(activity, a.pda);
      return {
        pda: a.pda,
        label: kindName(a.kind),
        recordAt: a.recordAt,
        cash: CASH.includes(a.kind),
        faceMinor: series.faceValue.minor,
        rateBps: a.kind === "INTR" ? (a.rateBps ?? null) : null,
        days: a.kind === "INTR" ? (a.accrualDays ?? null) : null,
        rows: (ents.get(a.pda) ?? []).map((e) => {
          const zero = { minor: "0", currency: series.faceValue.currency };
          return {
            owner: e.owner,
            units: e.units,
            gross: e.gross ?? zero,
            tax: e.tax ?? zero,
            net: e.net ?? zero,
            principal: e.principal ?? zero,
            status: e.status,
            tx: paidTx.get(e.owner) ?? null,
          };
        }),
      };
    });
  const audit: AuditRow[] = activity.map((ev) => {
    const a = actions.find((x) => x.pda === (ev.actionPda ?? ev.action_pda));
    return {
      at: formatDateTime(new Date(ev.ts * 1000).toISOString()),
      shown: formatDateTime(new Date(ev.ts * 1000).toISOString(), locale),
      event: ts.has(ev.kind) ? ts(ev.kind) : ev.kind,
      action: a?.corpId ?? "",
      slot: ev.slot,
      sig: ev.sig,
      url: `https://explorer.solana.com/tx/${ev.sig}${network.explorerCluster ? `?cluster=${network.explorerCluster}` : ""}`,
    };
  });
  const SHOWN = 8;
  // accrued interest today: face × rate × 30E/360 days since the current period started
  const today = almatyToday();
  const period = schedule.find(
    (s) =>
      s.periodStart &&
      s.periodEnd &&
      s.periodStart <= today &&
      today < s.periodEnd,
  );
  const accrued = period?.periodStart
    ? {
        minor: couponGross(
          1n,
          BigInt(series.faceValue.minor),
          series.couponRateBps,
          days30E360(period.periodStart, today),
        ).toString(),
        currency: series.faceValue.currency,
      }
    : null;
  const journalRow = (r: AuditRow, i: number) => (
    <li
      key={`${r.sig}-${i}`}
      className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 py-2.5 text-dense sm:grid-cols-[11rem_minmax(0,1fr)_auto]"
    >
      <span className="num text-n500 max-sm:col-span-2 max-sm:text-xs">
        {r.shown}
      </span>
      <span className="min-w-0">
        <span className="font-semibold text-n900">{r.event}</span>
        {r.action && <span className="num ml-2 text-n500">{r.action}</span>}
      </span>
      <Address value={r.sig} kind="tx" />
    </li>
  );

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6 sm:py-10">
      <Link
        href="/bonds"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-g700 hover:underline"
      >
        <Icon name="arrowLeft" className="size-4" />
        {t("back")}
      </Link>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-title font-extrabold tracking-tight">
              {series.ticker}
            </h1>
            {status(series.status)}
            <ProvenanceChip
              kind="onchain"
              href={`https://explorer.solana.com/address/${series.mint}${network.explorerCluster ? `?cluster=${network.explorerCluster}` : ""}`}
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-n600">
            <span className="num">{series.isin}</span>
            <Address value={series.mint} />
            <span className="num">
              {bpsToPercent(series.couponRateBps, locale)} · {freq} ·{" "}
              {DAY_COUNT[series.dayCount] ?? series.dayCount}
            </span>
          </div>
        </div>
        <ExportAuditButton
          rows={audit}
          filename={`${series.ticker}-audit.csv`}
          label={t("journal.export")}
        />
      </div>

      <div className="mt-6">{now}</div>

      <LifecycleRail className="mt-6" nodes={rail} locale={locale} />

      <Stagger className="mt-6 grid grid-cols-2 overflow-hidden rounded-card border border-n200 bg-n0 [&>*]:border-n100 max-lg:[&>*:nth-child(-n+2)]:border-b [&>*:nth-child(odd)]:border-r lg:grid-cols-4 lg:[&>*:not(:last-child)]:border-r">
        <StaggerItem className="min-w-0">
          <Kpi plain label={t("kpi.face")} value={money(series.faceValue)} />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            plain
            label={t("kpi.next")}
            value={
              <span className="num">
                {formatDate(series.nextCouponDate, locale)}
              </span>
            }
          />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            plain
            label={t("kpi.outstanding")}
            value={
              <span className="num">
                {Number(series.totalIssued).toLocaleString(
                  locale === "ru" ? "ru-RU" : "en-US",
                )}
              </span>
            }
          />
        </StaggerItem>
        <StaggerItem className="min-w-0">
          <Kpi
            plain
            label={t("kpi.paid")}
            value={money({
              minor: paidToHolders.toString(),
              currency: series.faceValue.currency,
            })}
          />
        </StaggerItem>
      </Stagger>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {flow && lastPaid ? (
          <MoneyFlow
            currency={flow.currency}
            locale={locale}
            issuer={{
              label: series.ticker,
              address: series.issuer ?? undefined,
            }}
            escrow={flow.escrow}
            recipients={flow.recipients}
            title={t("money.title", { id: lastPaid.corpId })}
          />
        ) : (
          <div className="rounded-card border border-dashed border-n300 bg-n0 p-6 text-sm text-n600">
            {t("register.empty")}
          </div>
        )}
        <YieldBlock
          accrued={accrued}
          asOf={`${today}T12:00:00+05:00`}
          locale={locale}
        />
      </div>

      <section id="register" className="mt-10 scroll-mt-32">
        <h2 className="text-lg font-bold">{t("register.title")}</h2>
        <p className="mt-0.5 mb-3 max-w-2xl text-sm text-n600">
          {t("register.lead")}
        </p>
        <RegisterPanel sets={registerSets} initial={rec} locale={locale} />
      </section>

      <section id="journal" className="mt-10">
        <h2 className="text-lg font-bold">{t("journal.title")}</h2>
        <p className="mt-0.5 mb-3 text-sm text-n600">{t("journal.lead")}</p>
        <div className="rounded-card border border-n200 bg-n0 px-4">
          {audit.length === 0 ? (
            <p className="py-6 text-center text-sm text-n600">
              {t("journal.empty")}
            </p>
          ) : (
            <>
              <ol className="divide-y divide-n100">
                {audit.slice(0, SHOWN).map(journalRow)}
              </ol>
              {audit.length > SHOWN && (
                <details className="border-t border-n100">
                  <summary className="cursor-pointer py-2.5 text-sm font-semibold text-g700">
                    {t("journal.more", { count: audit.length - SHOWN })}
                  </summary>
                  <ol className="divide-y divide-n100">
                    {audit.slice(SHOWN).map((r, i) => journalRow(r, i + SHOWN))}
                  </ol>
                </details>
              )}
            </>
          )}
        </div>
      </section>

      <div className="mt-10">
        <Tabs
          defaultValue={tab === "actions" || tab === "terms" ? tab : "schedule"}
          items={[
            {
              value: "schedule",
              label: t("tabs.schedule"),
              content: (
                <DataTable
                  columns={scheduleCols}
                  rows={schedule}
                  rowKey={(r) => String(r.couponNumber)}
                  empty={t("emptySchedule")}
                />
              ),
            },
            {
              value: "actions",
              label: t("tabs.actions"),
              content: (
                <DataTable
                  columns={actionCols}
                  rows={actions}
                  rowKey={(a) => a.pda}
                  empty={t("emptyActions")}
                />
              ),
            },
            {
              value: "terms",
              label: t("tabs.terms"),
              content: (
                <dl className="grid rounded-card border border-n200 bg-n0 sm:grid-cols-2">
                  {terms.map(([k, v], i) => (
                    <div
                      key={k}
                      className={`flex flex-col gap-1 p-4 sm:px-6 ${i > 0 ? "border-t border-n200" : ""} ${i === 1 ? "sm:border-t-0" : ""} sm:odd:border-r`}
                    >
                      <dt className="text-xs font-semibold text-n500">{k}</dt>
                      <dd className="text-sm text-n900">{v}</dd>
                    </div>
                  ))}
                </dl>
              ),
            },
          ]}
        />
      </div>
      {kaseTicker && (
        <div className="mt-10">
          <KasePanel ticker={kaseTicker} locale={locale} />
        </div>
      )}

      {documents.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-bold">{tDoc("title")}</h2>
          <ul className="mt-3 divide-y divide-n100 rounded-card border border-n200 bg-n0">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium text-n900">{d.filename}</span>
                  <span className="ml-2 text-xs text-n500">
                    {d.kind} · {(d.size / 1024).toFixed(0)} KB
                  </span>
                </span>
                <a
                  href={seriesDocumentUrl(d.id)}
                  className="font-semibold text-g700 underline"
                  download
                >
                  {tDoc("download")}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
