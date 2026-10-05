import Link from "next/link";
import {
  getAction,
  getNoticeText,
  getSeries,
  listActivity,
  listEntitlements,
  seev031Url,
  seev036Url,
  seev036ZipUrl,
} from "@/lib/api";
import { buildTimeline, nextStep, paidTxByOwner, STEP_LABELS } from "@/lib/actionFlow";
import { bpsToPercent, formatDate, formatDateTime, shortKey } from "@/lib/format";
import { AmountCell } from "@/components/ui/AmountCell";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { Timeline } from "@/components/ui/Timeline";
import { AdvanceButton } from "./AdvanceButton";
import { Countdown } from "./Countdown";
import { NoticePanel } from "./NoticePanel";
import { ReconcilePanel } from "./ReconcilePanel";

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left font-medium";
const td = "px-3 py-2";

const KIND_TONES: Record<string, string> = {
  INTR: "border-sky-800 bg-sky-950/60 text-sky-300",
  REDM: "border-violet-800 bg-violet-950/60 text-violet-300",
  MCAL: "border-amber-800 bg-amber-950/60 text-amber-300",
  PCAL: "border-amber-800 bg-amber-950/60 text-amber-300",
  BMET: "border-fuchsia-800 bg-fuchsia-950/60 text-fuchsia-300",
  CHAN: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
      {children}
    </h2>
  );
}

/** Horizontal tally bar segment (meeting votes). */
function Tally({ label, units, total, tone }: { label: string; units: bigint; total: bigint; tone: string }) {
  const pct = total > 0n ? Number((units * 10000n) / total) / 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-16 shrink-0 text-neutral-400">{label}</span>
      <div className="h-2.5 w-48 overflow-hidden rounded bg-neutral-800">
        <div className={`h-full ${tone}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-mono tabular-nums text-neutral-300">
        {units.toString()} ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

export default async function ActionPage({
  params,
}: {
  params: Promise<{ pda: string }>;
}) {
  const { pda } = await params;
  const action = await getAction(pda);
  const [series, entitlements, activity, noticeEn, noticeRu] = await Promise.all([
    getSeries(action.seriesMint).catch(() => null),
    listEntitlements(pda),
    listActivity(200),
    getNoticeText(pda, "en").catch(() => "notice unavailable"),
    getNoticeText(pda, "ru").catch(() => "уведомление недоступно"),
  ]);

  const isCash = action.kind !== "BMET" && action.kind !== "CHAN";
  const steps = buildTimeline(action, activity, series?.status === "Closed");
  const next = nextStep(action);
  const paidTx = paidTxByOwner(activity, pda);

  // Required escrow: Σ net + tax (+ principal from the entitlement rows — the
  // DTO has no total principal field; complete_action asserts the same sum).
  const principalTotal = entitlements.reduce((acc, e) => acc + BigInt(e.principal?.minor ?? "0"), 0n);
  const required =
    BigInt(action.totalNet?.minor ?? "0") +
    BigInt(action.totalTax?.minor ?? "0") +
    (isCash ? principalTotal : 0n);
  const escrow = BigInt(action.escrowBalance?.minor ?? "0");
  const funded = isCash && required > 0n && escrow >= required;

  const facts: [string, React.ReactNode][] = [
    ["Corp id", <span key="corp" className="font-mono">{action.corpId}</span>],
    ["COAF", <span key="coaf" className="font-mono">{action.officialId || "—"}</span>],
    ["Record date", <span key="rec" className="font-mono">{formatDateTime(action.recordAt)}</span>],
    ["Payment date", <span key="pay" className="font-mono">{formatDateTime(action.paymentAt)}</span>],
  ];
  if (action.periodStart && action.periodEnd) {
    facts.push([
      "Period",
      <span key="period" className="font-mono text-xs">
        {formatDate(`${action.periodStart}T00:00:00+05:00`)} → {formatDate(`${action.periodEnd}T00:00:00+05:00`)} ·{" "}
        {action.accrualDays ?? "—"}d ({action.rateBps != null ? bpsToPercent(action.rateBps) : "—"})
      </span>,
    ]);
  }
  facts.push(["Per unit", <AmountCell key="pu" amount={action.perUnitGross} />]);
  if (action.perUnitPrincipal && BigInt(action.perUnitPrincipal.minor) > 0n) {
    facts.push(["Per unit principal", <AmountCell key="pup" amount={action.perUnitPrincipal} />]);
  }
  if (action.snapshotSlot != null) {
    facts.push([
      "Snapshot",
      <span key="snap" className="flex flex-wrap items-center gap-x-2 font-mono text-xs">
        slot {action.snapshotSlot} · {action.unitsSnapshotted ?? "0"} units · {action.holdersSnapshotted ?? 0} holders
        {action.snapshotHash && <span className="text-neutral-500">hash {shortKey(action.snapshotHash, 8, 6)}</span>}
      </span>,
    ]);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/series/${action.seriesMint}`} className="text-xs text-neutral-500 hover:text-sky-300">
          ← {series?.ticker ?? shortKey(action.seriesMint)}
        </Link>
        <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${KIND_TONES[action.kind] ?? "border-neutral-700 bg-neutral-900 text-neutral-300"}`}>
          {action.kind}
        </span>
        <h1 className="font-mono text-lg font-semibold">{action.corpId}</h1>
        <StatusChip status={action.status} />
        <span className="rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-[11px] leading-4 text-neutral-400" title="mandatory / voluntary corporate action">
          {action.mandatory === "MAND" ? "mandatory" : action.mandatory === "VOLU" ? "voluntary" : action.mandatory}
        </span>
        <span className="text-xs text-neutral-500">
          action <ExplorerLink value={action.pda} kind="address" />
        </span>
      </div>

      <SectionTitle>Facts</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 rounded border border-neutral-800 p-4 sm:grid-cols-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-neutral-500">{label}</dt>
            <dd className="text-sm text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>

      <SectionTitle>Run the next step</SectionTitle>
      <div className="flex flex-wrap items-start gap-4 rounded border border-neutral-800 p-4">
        {next.step ? (
          <AdvanceButton pda={pda} label={next.label ?? STEP_LABELS[next.step]} />
        ) : (
          <p className="text-sm text-neutral-400">
            {next.wait}
            {action.status === "VotingOpen" && action.votingEndsAt && (
              <> · <Countdown endsAt={action.votingEndsAt} /></>
            )}
          </p>
        )}
        {action.status === "RecordStruck" && (action.holdersSnapshotted ?? 0) > 0 && (
          <AdvanceButton pda={pda} label={STEP_LABELS.finalize} secondary />
        )}
        {next.step === "apply" && <SimulatedBadge label="ARDFM registration" />}
        <p className="max-w-md text-xs text-neutral-500">
          Each button sends one transaction batch through the registrar service (qupon CLI). The chain
          re-checks every precondition — errors surface inline with the on-chain error name.
        </p>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <div>
          <SectionTitle>Status timeline</SectionTitle>
          <Timeline steps={steps} />
        </div>
        <div className="space-y-4">
          {isCash && (
            <div className="rounded border border-neutral-800 p-4">
              <h3 className="text-sm font-medium">Funding</h3>
              <div className="mt-3 flex items-baseline justify-between gap-3 text-xs text-neutral-400">
                <span>escrow <ExplorerLink value={action.escrow ?? action.pda} kind="address" label={shortKey(action.escrow ?? "", 4, 4)} /></span>
                <span className={funded ? "text-emerald-300" : required === 0n ? "" : "text-amber-300"}>
                  {funded ? "fully funded" : required === 0n ? "awaiting snapshot" : "underfunded"}
                </span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded bg-neutral-800">
                <div
                  className={`h-full ${funded ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${required > 0n ? Math.min(Number((escrow * 100n) / required), 100) : 0}%` }}
                />
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <AmountCell amount={action.escrowBalance} />
                <span className="text-neutral-500">/</span>
                <AmountCell
                  amount={{
                    minor: required.toString(),
                    display: "",
                    currency: action.totalNet?.currency ?? "",
                  }}
                />
                <span className="text-xs text-neutral-500">escrow / required (Σ net + tax{principalTotal > 0n ? " + principal" : ""})</span>
              </div>
            </div>
          )}
          {action.kind === "BMET" && (
            <div className="rounded border border-neutral-800 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-medium">Bondholder meeting</h3>
                {action.votingEndsAt && (
                  <span className="text-xs text-neutral-500">
                    ends {formatDateTime(action.votingEndsAt)} · <Countdown endsAt={action.votingEndsAt} />
                  </span>
                )}
              </div>
              <p className="mt-3 text-sm text-neutral-300">
                Proposal: coupon{" "}
                <span className="font-mono">{series ? bpsToPercent(series.couponRateBps) : "—"}</span> →{" "}
                <span className="font-mono text-amber-300">
                  {action.proposalNewRateBps != null ? bpsToPercent(action.proposalNewRateBps) : "—"}
                </span>
                {action.proposalNewMaturity && (
                  <> · maturity → <span className="font-mono">{formatDate(`${action.proposalNewMaturity}T00:00:00+05:00`)}</span></>
                )}
              </p>
              <div className="mt-3 space-y-2">
                <Tally label="For" units={BigInt(action.votesFor ?? "0")} total={BigInt(action.unitsSnapshotted ?? "0")} tone="bg-emerald-500" />
                <Tally label="Against" units={BigInt(action.votesAgainst ?? "0")} total={BigInt(action.unitsSnapshotted ?? "0")} tone="bg-red-500" />
                <Tally label="Abstain" units={BigInt(action.votesAbstain ?? "0")} total={BigInt(action.unitsSnapshotted ?? "0")} tone="bg-neutral-500" />
              </div>
              <p className="mt-3 font-mono text-xs text-neutral-500">
                quorum {series ? series.quorumBps / 100 : "—"}% of units · approval {series ? series.approvalBps / 100 : "—"}% of votes cast
                {action.result && action.result !== "Pending" && (
                  <span className={`ml-2 ${action.result === "Approved" ? "text-emerald-300" : "text-red-300"}`}>result: {action.result}</span>
                )}
              </p>
            </div>
          )}
          <ReconcilePanel pda={pda} />
        </div>
      </div>

      <SectionTitle>Entitlements ({entitlements.length})</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>Owner</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={`${th} text-right`}>Gross</th>
              <th className={`${th} text-right`}>Tax</th>
              <th className={`${th} text-right`}>Net</th>
              <th className={`${th} text-right`}>Principal</th>
              <th className={th}>Status</th>
              <th className={th}>Paid tx</th>
              <th className={th}>seev.036</th>
            </tr>
          </thead>
          <tbody>
            {entitlements.length === 0 && (
              <tr>
                <td className={`${td} text-neutral-600`} colSpan={9}>
                  none yet — appears after the snapshot step
                </td>
              </tr>
            )}
            {entitlements.map((e) => (
              <tr key={e.pda} className="border-b border-neutral-800/60 last:border-0">
                <td className={`${td} font-mono text-xs`}>
                  <ExplorerLink value={e.owner} kind="address" />
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>{e.units}</td>
                <td className={`${td} text-right`}><AmountCell amount={e.gross} /></td>
                <td className={`${td} text-right`}><AmountCell amount={e.tax} /></td>
                <td className={`${td} text-right`}><AmountCell amount={e.net} /></td>
                <td className={`${td} text-right`}>
                  {e.principal && BigInt(e.principal.minor) > 0n ? <AmountCell amount={e.principal} /> : <span className="font-mono text-neutral-600">—</span>}
                </td>
                <td className={td}>
                  <StatusChip status={e.status} />
                  {e.paidAt && <span className="ml-2 font-mono text-[10px] text-neutral-600">{formatDateTime(e.paidAt)}</span>}
                </td>
                <td className={`${td} text-xs`}>
                  {paidTx.get(e.owner) ? (
                    <ExplorerLink value={paidTx.get(e.owner)!} kind="tx" />
                  ) : (
                    <span className="text-neutral-600">—</span>
                  )}
                </td>
                <td className={`${td} text-xs`}>
                  <a href={seev036Url(e.pda)} className="text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300">
                    xml
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Downloads</SectionTitle>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded border border-neutral-800 p-4">
          <h3 className="text-sm font-medium">ISO 20022</h3>
          <p className="flex flex-wrap items-center gap-3 text-xs">
            <a href={seev031Url(pda)} className="text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300">
              seev.031 — agent notification (XML)
            </a>
            <a href={seev036ZipUrl(pda)} className="text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300">
              seev.036 — all holders (ZIP)
            </a>
          </p>
          <p className="flex items-center gap-2 text-xs text-neutral-500">
            <SimulatedBadge label="Swift delivery" />
            generated from on-chain state; network delivery not integrated
          </p>
        </div>
        <NoticePanel en={noticeEn} ru={noticeRu} />
      </div>
    </section>
  );
}
