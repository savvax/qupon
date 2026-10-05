import Link from "next/link";
import { listSeries } from "@/lib/api";
import { bpsToPercent, formatDate, frequencyLabel } from "@/lib/format";
import { AmountCell } from "@/components/ui/AmountCell";
import { StatusChip } from "@/components/ui/StatusChip";

export const dynamic = "force-dynamic";

export default async function SeriesListPage() {
  const series = await listSeries();

  return (
    <section>
      <h1 className="mb-1 text-lg font-semibold">Bond series</h1>
      <p className="mb-4 text-xs text-neutral-500">
        {series.length} series · devnet · amounts in settlement currency
      </p>
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
            {series.map((s) => (
              <tr
                key={s.mint}
                className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-900/40"
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/series/${s.mint}`}
                    className="font-medium text-neutral-100 hover:text-sky-300"
                  >
                    {s.ticker}
                  </Link>
                </td>
                <td className="px-3 py-2 font-mono text-xs text-neutral-400">{s.isin}</td>
                <td className="px-3 py-2 text-right">
                  <AmountCell amount={s.faceValue} />
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums">
                  {bpsToPercent(s.couponRateBps)}
                </td>
                <td className="px-3 py-2 text-neutral-400">{frequencyLabel(s.frequency)}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {formatDate(s.nextCouponDate)}
                </td>
                <td className="px-3 py-2">
                  <StatusChip status={s.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
