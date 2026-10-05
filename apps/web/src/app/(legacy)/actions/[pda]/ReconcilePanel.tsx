"use client";

import { useState } from "react";
import { getReconcile, type ReconcileReport } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/**
 * On-demand reconciliation (GET /actions/{pda}/reconcile re-reads the whole
 * chain, so it is not part of the render path). ok/mismatch, hashes, totals.
 */
export function ReconcilePanel({ pda }: { pda: string }) {
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setReport(await getReconcile(pda));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded border border-neutral-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Reconcile</h3>
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded border border-neutral-600 px-3 py-1 text-xs text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 disabled:opacity-50"
        >
          {busy ? "checking chain…" : report ? "re-run" : "run reconcile"}
        </button>
      </div>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
      {report && (
        <div className="mt-3 space-y-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center rounded border px-1.5 py-0.5 font-medium leading-4 ${
                report.ok
                  ? "border-emerald-800 bg-emerald-950/60 text-emerald-300"
                  : "border-red-800 bg-red-950/60 text-red-300"
              }`}
            >
              {report.ok ? "OK" : "MISMATCH"}
            </span>
            <span className="text-neutral-500">
              holders {report.holders} · supply {report.supply} · snapshotted{" "}
              {report.unitsSnapshotted}
            </span>
            {report.checkedAt && (
              <span className="font-mono text-neutral-600">
                {formatDateTime(
                  new Date(report.checkedAt * 1000).toISOString(),
                )}
              </span>
            )}
          </div>
          <div className="grid gap-1 font-mono text-[11px] text-neutral-400">
            <div>
              hash {report.hashMatches ? "✓ matches" : "✗ differs"} · expected{" "}
              {report.expectedHash} · on-chain {report.onchainHash}
            </div>
            <div>
              totals {report.totalsMatch ? "✓ match" : "✗ differ"} (Σ
              net+tax+principal vs total_paid)
            </div>
          </div>
          {report.mismatches.length > 0 && (
            <ul className="space-y-1 text-red-300">
              {report.mismatches.map((m, i) => (
                <li key={i} className="font-mono">
                  {m.owner}: {m.reason}
                  {m.fields && m.fields.length > 0
                    ? ` (${m.fields.join(", ")})`
                    : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
