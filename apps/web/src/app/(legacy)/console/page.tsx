import Link from "next/link";
import { listSeries } from "@/lib/api";
import { bpsToPercent, formatDate, frequencyLabel } from "@/lib/format";
import { AmountCell } from "@/components/ui/AmountCell";
import { StatusChip } from "@/components/ui/StatusChip";

export const dynamic = "force-dynamic";

type SeriesRow = Awaited<ReturnType<typeof listSeries>>[number];

/** Active first; within a group newest first (demo tickers end in a time-ordered base36 run id). */
function byStatusThenNewest(a: SeriesRow, b: SeriesRow): number {
  const rank = (s: SeriesRow) => (s.status === "Active" ? 0 : s.status === "Closed" ? 2 : 1);
  return rank(a) - rank(b) || b.ticker.localeCompare(a.ticker);
}

function SeriesTable({ rows }: { rows: SeriesRow[] }) {
  return (
    <div className="overflow-x-auto rounded border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-500">
            <th className="px-3 py-2 font-medium">Ticker</th>
            <th className="px-3 py-2 font-medium">ISIN</th>
            <th className="px-3 py-2 text-right font-medium">Face</th>
            <th className="px-3 py-2 text-right font-medium">Coupon</th>
            <th className="px-3 py-2 font-medium">Frequency</th>
            <th className="px-3 py-2 font-medium">Next coupon</th>
            <th className="px-3 py-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.mint} className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-900/40">
              <td className="px-3 py-2">
                <Link href={`/series/${s.mint}`} className="font-medium text-neutral-100 hover:text-sky-300">
                  {s.ticker}
                </Link>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-neutral-400">{s.isin}</td>
              <td className="px-3 py-2 text-right">
                <AmountCell amount={s.faceValue} />
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{bpsToPercent(s.couponRateBps)}</td>
              <td className="px-3 py-2 text-neutral-400">{frequencyLabel(s.frequency)}</td>
              <td className="px-3 py-2 font-mono text-xs">
                {s.status === "Closed" ? "—" : formatDate(s.nextCouponDate)}
              </td>
              <td className="px-3 py-2">
                <StatusChip status={s.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function SeriesListPage() {
  const series = (await listSeries()).sort(byStatusThenNewest);
  const open = series.filter((s) => s.status !== "Closed");
  const closed = series.filter((s) => s.status === "Closed");

  return (
    <section>
      <h1 className="mb-1 text-lg font-semibold">Bond series</h1>
      <p className="mb-4 max-w-3xl text-xs text-neutral-500">
        Each series is a Token-2022 bond on Solana devnet. Open one for its terms, coupon schedule, holders and
        corporate actions; an action page runs the record date → entitlements → payment flow step by step with a
        transaction link for each step. Amounts in the settlement currency.
      </p>
      <SeriesTable rows={open} />
      {closed.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-xs text-neutral-400 hover:text-neutral-200">
            {closed.length} closed series — redeemed or called and burned in earlier demo runs
          </summary>
          <div className="mt-3">
            <SeriesTable rows={closed} />
          </div>
        </details>
      )}
    </section>
  );
}
