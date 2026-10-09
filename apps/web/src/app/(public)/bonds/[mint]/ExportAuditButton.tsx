"use client";

import { Button } from "@/components/ui/Button";

export type AuditRow = {
  /** machine time for the CSV ("2026-02-26 09:40", Almaty) */
  at: string;
  /** the same time for the page, in the reader's locale */
  shown: string;
  event: string;
  action: string;
  slot?: number;
  sig: string;
  url: string;
};

const cell = (v: string | number | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** "Export issue audit (CSV)": every journal row with its signature and explorer link, built in the browser. */
export function ExportAuditButton({
  rows,
  filename,
  label,
}: {
  rows: AuditRow[];
  filename: string;
  label: string;
}) {
  const download = () => {
    const csv = [
      "time_almaty,event,action,slot,signature,explorer",
      ...rows.map((r) => [r.at, r.event, r.action, r.slot, r.sig, r.url].map(cell).join(",")),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Button size="sm" variant="secondary" onClick={download} disabled={rows.length === 0}>
      {label}
    </Button>
  );
}
