import Link from "next/link";
import { getSchedule, getSeries, listActions, listInvestors } from "@/lib/api";
import {
  bpsToPercent,
  formatDate,
  formatDateTime,
  frequencyLabel,
  shortKey,
} from "@/lib/format";
import { AmountCell } from "@/components/ui/AmountCell";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { StatusChip } from "@/components/ui/StatusChip";

export const dynamic = "force-dynamic";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
      {children}
    </h2>
  );
}

const th = "px-3 py-2 text-left font-medium";
const td = "px-3 py-2";

export default async function SeriesPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const [series, investors, schedule, actions] = await Promise.all([
    getSeries(mint),
    listInvestors(mint),
    getSchedule(mint),
    listActions(mint),
  ]);

  const terms: [string, React.ReactNode][] = [
    ["ISIN", <span key="isin" className="font-mono">{series.isin}</span>],
    ["Face value", <AmountCell key="face" amount={series.faceValue} />],
    ["Coupon", <span key="coupon" className="font-mono tabular-nums">{bpsToPercent(series.couponRateBps)}</span>],
    ["Frequency", <span key="freq">{frequencyLabel(series.frequency)}</span>],
    ["Day count", <span key="dc" className="font-mono">{series.dayCount}</span>],
    ["Issue date", <span key="issue" className="font-mono">{formatDate(`${series.issueDate}T00:00:00+05:00`)}</span>],
    ["Maturity", <span key="mat" className="font-mono">{formatDate(`${series.maturityDate}T00:00:00+05:00`)}</span>],
    ["Next coupon", <span key="nc" className="font-mono">{formatDate(series.nextCouponDate)}</span>],
    ["Units issued", <span key="units" className="font-mono">{series.totalIssued}</span>],
    [
      "Quorum / approval",
      <span key="quorum" className="font-mono tabular-nums">
        {series.quorumBps / 100}% / {series.approvalBps / 100}%
      </span>,
    ],
    [
      "Settlement cash",
      <span key="cash" className="flex items-center gap-2">
        <span className="font-mono">{shortKey(series.cashMint, 6, 4)}</span>
        <ExplorerLink value={series.cashMint} kind="address" label="explorer ↗" />
      </span>,
    ],
    [
      "Registrar / issuer / paying agent",
      <span key="roles" className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {[series.registrar, series.issuer, series.payingAgent]
          .filter((k): k is string => Boolean(k))
          .map((k) => (
            <ExplorerLink key={k} value={k} kind="address" />
          ))}
      </span>,
    ],
  ];

  return (
    <section>
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/console" className="text-xs text-neutral-500 hover:text-sky-300">
          ← all series
        </Link>
        <h1 className="text-lg font-semibold">{series.ticker}</h1>
        <StatusChip status={series.status} />
        <span className="text-xs text-neutral-500">
          mint <ExplorerLink value={series.mint} kind="address" />
        </span>
      </div>

      <SectionTitle>Terms</SectionTitle>
      <dl className="grid grid-cols-2 gap-x-8 gap-y-2 rounded border border-neutral-800 p-4 sm:grid-cols-3">
        {terms.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-xs text-neutral-500">{label}</dt>
            <dd className="text-sm text-neutral-200">{value}</dd>
          </div>
        ))}
      </dl>

      <SectionTitle>Coupon schedule</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>#</th>
              <th className={th}>Period</th>
              <th className={th}>Record</th>
              <th className={th}>Payment</th>
              <th className={`${th} text-right`}>Per unit</th>
              <th className={`${th} text-right`}>Total</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((item) => (
              <tr key={item.couponNumber} className="border-b border-neutral-800/60 last:border-0">
                <td className={`${td} font-mono`}>{item.couponNumber}</td>
                <td className={`${td} font-mono text-xs`}>
                  {item.periodStart} → {item.periodEnd}
                </td>
                <td className={`${td} font-mono text-xs`}>{formatDateTime(item.recordDate)}</td>
                <td className={`${td} font-mono text-xs`}>{formatDateTime(item.paymentDate)}</td>
                <td className={`${td} text-right`}>
                  <AmountCell amount={item.amountPerUnit} />
                </td>
                <td className={`${td} text-right`}>
                  <AmountCell amount={item.totalAmount} />
                </td>
                <td className={td}>
                  {item.actionPda ? (
                    <Link
                      href={`/actions/${item.actionPda}`}
                      className="hover:text-sky-300"
                    >
                      <StatusChip status={item.status} />
                    </Link>
                  ) : (
                    <StatusChip status={item.status} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Holders ({investors.length})</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>Owner</th>
              <th className={`${th} text-right`}>Units</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {investors.map((inv) => (
              <tr key={inv.owner} className="border-b border-neutral-800/60 last:border-0">
                <td className={`${td} font-mono text-xs`}>
                  <ExplorerLink value={inv.owner} kind="address" />
                </td>
                <td className={`${td} text-right font-mono tabular-nums`}>{inv.units}</td>
                <td className={td}>
                  <StatusChip status={inv.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <SectionTitle>Corporate actions ({actions.length})</SectionTitle>
      <div className="overflow-x-auto rounded border border-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-800 bg-neutral-900/60 text-xs uppercase tracking-wider text-neutral-500">
              <th className={th}>Corp id</th>
              <th className={th}>Kind</th>
              <th className={th}>Record</th>
              <th className={th}>Payment</th>
              <th className={th}>Status</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {actions.length === 0 && (
              <tr>
                <td className={`${td} text-neutral-600`} colSpan={6}>
                  none announced
                </td>
              </tr>
            )}
            {actions.map((action) => (
              <tr key={action.pda} className="border-b border-neutral-800/60 last:border-0">
                <td className={`${td} font-mono text-xs`}>{action.corpId}</td>
                <td className={`${td} font-mono text-xs`}>{action.kind}</td>
                <td className={`${td} font-mono text-xs`}>{formatDateTime(action.recordAt)}</td>
                <td className={`${td} font-mono text-xs`}>{formatDateTime(action.paymentAt)}</td>
                <td className={td}>
                  <StatusChip status={action.status} />
                </td>
                <td className={`${td} text-right`}>
                  <Link
                    href={`/actions/${action.pda}`}
                    className="text-xs text-sky-400 hover:text-sky-300"
                  >
                    open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
