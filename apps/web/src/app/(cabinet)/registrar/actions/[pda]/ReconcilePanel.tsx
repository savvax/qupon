"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { getReconcile, type ReconcileReport } from "@/lib/api";

/** On-demand reconciliation: re-reads the whole chain, so it runs on click, not on render. */
export function ReconcilePanel({ pda }: { pda: string }) {
  const t = useTranslations("action.reconcile");
  const [report, setReport] = useState<ReconcileReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const run = async () => {
    setBusy(true);
    setError(undefined);
    try {
      setReport(await getReconcile(pda));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-card border border-n200 bg-n0 p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">{t("title")}</h3>
        <Button variant="secondary" size="sm" loading={busy} onClick={run}>
          {report ? t("rerun") : t("run")}
        </Button>
      </div>
      <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      {error && <p className="mt-3 text-sm text-err-fg">{error}</p>}
      {report && (
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={report.ok ? "success" : "danger"}>
              {report.ok ? t("ok") : t("mismatch")}
            </Badge>
            <span className="num text-n600">
              {t("summary", { holders: report.holders, supply: report.supply })}
            </span>
          </div>
          <ul className="space-y-1 text-n700">
            <li>
              {report.hashMatches ? "✓" : "✗"} {t("hash")}{" "}
              <span className="text-n500">
                ({t(report.hashScheme === 1 ? "schemeSet" : "schemeRolling")})
              </span>
            </li>
            <li>
              {report.totalsMatch ? "✓" : "✗"} {t("totals")}
            </li>
          </ul>
          {report.mismatches.length > 0 && (
            <ul className="space-y-1 text-xs text-err-fg">
              {report.mismatches.map((m, i) => (
                <li key={i} className="num break-all">
                  {m.owner}: {m.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
