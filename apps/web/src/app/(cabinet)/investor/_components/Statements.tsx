"use client";

/**
 * Statements (Plan 3 Task 6 step 4): every settled payout as a row with the
 * seev.036 (ISO 20022) download and the payment's tx link.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { paidTxByOwner } from "@/lib/actionFlow";
import { listActivity, seev036Url } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { useInvestor } from "./InvestorIdentity";
import { usePortalRows } from "../_lib/usePortalRows";

const TH =
  "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-n500";
const TD = "px-3 py-2 align-top";

/** The /investor/statements page body inside <InvestorIdentity>. */
export function Statements() {
  const { owner } = useInvestor();
  const t = useTranslations("investor.statements");
  const tc = useTranslations("common");
  const locale = useLocale() as "en" | "ru";
  const { rows, error, reload } = usePortalRows();

  // actionPda → owner → EntitlementPaid signature (the tx column)
  const [paidTxs, setPaidTxs] = useState<Map<string, string> | null>(null);
  useEffect(() => {
    if (!rows) return;
    let live = true;
    listActivity(200)
      .then((activity) => {
        if (!live) return;
        const out = new Map<string, string>();
        for (const row of rows)
          for (const e of row.entitlements) {
            const sig = paidTxByOwner(activity, e.actionPda).get(owner);
            if (sig && !out.has(e.actionPda)) out.set(e.actionPda, sig);
          }
        setPaidTxs(out);
      })
      .catch(() => live && setPaidTxs(new Map()));
    return () => {
      live = false;
    };
  }, [rows, owner]);

  if (error) {
    return (
      <EmptyState
        title={t("loadFailed")}
        body={error}
        action={
          <Button variant="secondary" onClick={reload}>
            {tc("retry")}
          </Button>
        }
      />
    );
  }
  if (!rows || !paidTxs) return <Skeleton className="h-64" />;

  const payouts = rows
    .flatMap((row) =>
      row.entitlements
        .filter((e) => e.status === "Paid")
        .map((e) => ({
          e,
          row,
          action: row.actions.find((a) => a.pda === e.actionPda),
        })),
    )
    .sort((a, b) => (b.e.paidAt ?? "").localeCompare(a.e.paidAt ?? ""));

  if (payouts.length === 0) {
    return <EmptyState title={t("empty")} body={t("emptyBody")} />;
  }

  return (
    <Card padding="md" className="max-w-4xl overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-n200">
            <th className={TH}>{t("col.action")}</th>
            <th className={TH}>{t("col.kind")}</th>
            <th className={TH}>{t("col.paidOn")}</th>
            <th className={`${TH} text-right`}>{t("col.net")}</th>
            <th className={TH}>{t("col.statement")}</th>
            <th className={TH}>{t("col.tx")}</th>
          </tr>
        </thead>
        <tbody>
          {payouts.map(({ e, row, action }) => (
            <tr key={e.pda} className="border-b border-n100 last:border-0">
              <td className={TD}>
                <span className="font-semibold">
                  {action?.corpId ?? e.actionPda.slice(0, 8)}
                </span>
                <span className="block text-xs text-n500">
                  {row.series.ticker}
                </span>
              </td>
              <td className={`${TD} font-mono text-xs`}>
                {action?.kind ?? "—"}
              </td>
              <td className={`${TD} num text-xs`}>
                {e.paidAt ? formatDate(e.paidAt) : "—"}
              </td>
              <td className={`${TD} text-right`}>
                {e.net ? (
                  <Amount
                    minor={e.net.minor}
                    currency={e.net.currency}
                    locale={locale}
                  />
                ) : (
                  "—"
                )}
              </td>
              <td className={TD}>
                <Button asChild variant="secondary" size="sm">
                  <a
                    href={seev036Url(e.actionPda)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("seev036")}
                  </a>
                </Button>
              </td>
              <td className={TD}>
                {paidTxs.get(e.actionPda) ? (
                  <Address
                    value={paidTxs.get(e.actionPda) as string}
                    kind="tx"
                  />
                ) : (
                  <span className="text-n400">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-n500">{t("note")}</p>
    </Card>
  );
}
