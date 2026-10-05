"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import { boPost } from "@/lib/boClient";
import type { Schemas } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useRunWrite } from "@/lib/useRunWrite";

type Approval = Schemas["Approval"];
type ApproveResult = { signature?: string | null; signatures?: string[] };

const almaty = (unixSeconds: number) =>
  formatDateTime(new Date(unixSeconds * 1000).toISOString());

/** One scheduler proposal: what the autopilot wants to run next. */
export function Approvals({
  pending,
  executed,
}: {
  pending: Approval[];
  executed: Approval[];
}) {
  const t = useTranslations("registrar.autopilot");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [busy, setBusy] = useState<number | null>(null);

  async function approve(row: Approval) {
    setBusy(row.id);
    const r = await runWrite<ApproveResult>({
      pending: t("approving"),
      success: () => t("approved"),
      call: () => boPost<ApproveResult>(`registrar/approvals/${row.id}/approve`),
      txs: (res) =>
        res.signatures ?? (res.signature ? [res.signature] : []),
    });
    setBusy(null);
    if (r) router.refresh(); // executed rows only appear after the API moved the row
  }

  const argv = (row: Approval) => {
    const cmd = row.args.join(" ");
    return (
      <span className="block max-w-[28rem] truncate text-xs" title={cmd}>
        {cmd}
      </span>
    );
  };

  const pendingCols: Column<Approval>[] = [
    {
      key: "ts",
      header: t("time"),
      value: (r) => r.ts,
      render: (r) => almaty(r.ts),
      mono: true,
    },
    {
      key: "series",
      header: t("series"),
      value: (r) => r.seriesMint,
      render: (r) => <Address value={r.seriesMint} />,
    },
    {
      key: "action",
      header: t("action"),
      value: (r) => r.actionPda ?? "",
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
      mono: true,
    },
    { key: "step", header: t("step"), value: (r) => r.step, mono: true },
    { key: "argv", header: t("argv"), value: (r) => r.args.join(" "), render: argv },
    {
      key: "approve",
      header: "",
      value: (r) => r.id,
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
    {
      key: "ts",
      header: t("time"),
      value: (r) => r.ts,
      render: (r) => almaty(r.ts),
      mono: true,
    },
    {
      key: "series",
      header: t("series"),
      value: (r) => r.seriesMint,
      render: (r) => <Address value={r.seriesMint} />,
    },
    {
      key: "action",
      header: t("action"),
      value: (r) => r.actionPda ?? "",
      render: (r) => (r.actionPda ? <Address value={r.actionPda} /> : "—"),
      mono: true,
    },
    { key: "step", header: t("step"), value: (r) => r.step, mono: true },
    { key: "argv", header: t("argv"), value: (r) => r.args.join(" "), render: argv },
    {
      key: "tx",
      header: t("tx"),
      value: (r) => (r.detail as { signature?: string } | null)?.signature ?? "",
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
              initialSort={{ key: "ts", dir: "desc" }}
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
              initialSort={{ key: "ts", dir: "desc" }}
              empty={t("emptyExecuted")}
            />
          ),
        },
      ]}
    />
  );
}
