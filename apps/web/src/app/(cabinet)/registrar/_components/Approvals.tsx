"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import type { Schemas } from "@/lib/api";
import { boPost } from "@/lib/boClient";
import { formatDateTime } from "@/lib/format";
import { useRunWrite } from "@/lib/useRunWrite";

type Approval = Schemas["Approval"];
type ApproveResult = { signature?: string | null; signatures?: string[] };

const almaty = (unixSeconds: number, locale: string) => (
  <span className="num text-xs whitespace-nowrap">
    {formatDateTime(new Date(unixSeconds * 1000).toISOString(), locale)}
  </span>
);

/** One scheduler proposal: what the autopilot wants to run next. */
// Scheduler step ids (executor.Step*) → the step labels the action page uses.
const STEP_LABEL: Record<string, string> = {
  strike_record: "strike",
  snapshot_batch: "snapshot",
  finalize_snapshot: "finalize",
  fund_action: "fund",
  pay_batch: "pay",
  complete_action: "complete",
  retire_batch: "retire",
  close_series: "close",
  meeting_finalize: "meet_finalize",
  apply_terms_change: "apply",
};

export function Approvals({
  pending,
  executed,
  tickers,
}: {
  pending: Approval[];
  executed: Approval[];
  /** mint → ticker */
  tickers: Record<string, string>;
}) {
  const t = useTranslations("registrar.autopilot");
  const tstep = useTranslations("steps.do");
  const kinds = useTranslations("landing.kinds");
  const locale = useLocale();
  const runWrite = useRunWrite();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function approve(row: Approval) {
    setBusy(row.id);
    const r = await runWrite<ApproveResult>({
      pending: t("approving"),
      success: () => t("approved"),
      call: () =>
        boPost<ApproveResult>(`registrar/approvals/${row.id}/approve`),
      txs: (res) => res.signatures ?? (res.signature ? [res.signature] : []),
    });
    setBusy(null);
    if (r) router.refresh(); // executed rows only appear after the API moved the row
  }

  // "step:strike_record" → "Strike record date"; "announce:INTR" → "Announce · Coupon"
  const stepLabel = (row: Approval) => {
    const [kind, id = ""] = row.step.split(":");
    if (kind === "announce")
      return `${tstep("announce")} · ${kinds.has(id) ? kinds(id) : id}`;
    return STEP_LABEL[id] ? tstep(STEP_LABEL[id]) : row.step;
  };

  // the CLI command stays available, folded away
  const argv = (row: Approval) => (
    <details className="max-w-[28rem] text-xs">
      <summary className="cursor-pointer font-semibold text-n600 select-none hover:text-n900">
        {t("showCommand")}
      </summary>
      <code className="mt-1 block rounded-sm bg-n50 px-2 py-1 break-all text-n800">
        {row.args.join(" ")}
      </code>
    </details>
  );

  const series = (r: Approval) => (
    <span className="font-semibold">
      {tickers[r.seriesMint] ?? <Address value={r.seriesMint} />}
    </span>
  );

  const pendingCols: Column<Approval>[] = [
    { key: "ts", header: t("time"), render: (r) => almaty(r.ts, locale) },
    {
      key: "series",
      header: t("series"),
      render: series,
    },
    {
      key: "action",
      header: t("action"),
      render: (r) =>
        r.actionPda ? (
          <Link
            href={`/registrar/actions/${r.actionPda}`}
            className="font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
          >
            {r.actionPda.slice(0, 4)}…{r.actionPda.slice(-4)}
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "step",
      header: t("step"),
      render: (r) => <span className="font-semibold">{stepLabel(r)}</span>,
    },
    { key: "argv", header: t("argv"), render: argv, hideBelow: "lg" },
    {
      key: "approve",
      header: "",
      render: (r) => (
        <Button
          size="sm"
          loading={busy === r.id}
          disabled={busy !== null}
          onClick={() => void approve(r)}
        >
          {t("approve")}
        </Button>
      ),
    },
  ];

  const executedCols: Column<Approval>[] = [
    { key: "ts", header: t("time"), render: (r) => almaty(r.ts, locale) },
    {
      key: "series",
      header: t("series"),
      render: series,
    },
    {
      key: "action",
      header: t("action"),
      render: (r) => (r.actionPda ? <Address value={r.actionPda} /> : "—"),
    },
    {
      key: "step",
      header: t("step"),
      render: (r) => <span className="font-semibold">{stepLabel(r)}</span>,
    },
    { key: "argv", header: t("argv"), render: argv, hideBelow: "lg" },
    {
      key: "tx",
      header: t("tx"),
      render: (r) => {
        const sig = (r.detail as { signature?: string } | null)?.signature;
        return sig ? <Address value={sig} kind="tx" /> : "—";
      },
    },
  ];

  return (
    <Tabs
      items={[
        {
          value: "pending",
          label: `${t("pending")} (${pending.length})`,
          content: (
            <DataTable
              columns={pendingCols}
              rows={pending}
              rowKey={(r) => String(r.id)}
              empty={t("emptyPending")}
            />
          ),
        },
        {
          value: "executed",
          label: `${t("executed")} (${executed.length})`,
          content: (
            <DataTable
              columns={executedCols}
              rows={executed}
              rowKey={(r) => String(r.id)}
              empty={t("emptyExecuted")}
            />
          ),
        },
      ]}
    />
  );
}
