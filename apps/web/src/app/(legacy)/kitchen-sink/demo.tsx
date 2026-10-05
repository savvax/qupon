"use client";

import { AmountCell } from "@/components/ui/AmountCell";
import { LegacyDataTable as DataTable } from "@/components/ui/LegacyDataTable";
import type { Column } from "@/components/ui/LegacyDataTable";
import { ExplorerLink } from "@/components/ui/ExplorerLink";
import { StatusChip } from "@/components/ui/StatusChip";
import { useToast } from "@/components/ui/Toast";
import type { Amount } from "@/lib/api";

type Row = {
  owner: string;
  units: number;
  gross: Amount;
  net: Amount;
  status: string;
};

const OWNER_A = "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo";
const OWNER_B = "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC";

const ROWS: Row[] = [
  {
    owner: "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
    units: 10,
    gross: { minor: "50000", display: "500.00 KZT", currency: "tKZT" },
    net: { minor: "50000", display: "500.00 KZT", currency: "tKZT" },
    status: "Paid",
  },
  {
    owner: "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC",
    units: 65,
    gross: { minor: "325000", display: "3,250.00 KZT", currency: "tKZT" },
    net: { minor: "325000", display: "3,250.00 KZT", currency: "tKZT" },
    status: "Snapshotted",
  },
  {
    owner: "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXG9ntLau",
    units: 25,
    gross: { minor: "125000", display: "1,250.00 KZT", currency: "tKZT" },
    net: { minor: "125000", display: "1,250.00 KZT", currency: "tKZT" },
    status: "Paid",
  },
];

const COLUMNS: Column<Row>[] = [
  {
    key: "owner",
    header: "Owner",
    mono: true,
    value: (r) => r.owner,
    render: (r) => <ExplorerLink value={r.owner} kind="address" />,
  },
  {
    key: "units",
    header: "Units",
    align: "right",
    mono: true,
    value: (r) => r.units,
  },
  {
    key: "gross",
    header: "Gross",
    align: "right",
    value: (r) => Number(r.gross.minor),
    render: (r) => <AmountCell amount={r.gross} />,
  },
  {
    key: "net",
    header: "Net",
    align: "right",
    value: (r) => Number(r.net.minor),
    render: (r) => <AmountCell amount={r.net} />,
  },
  {
    key: "status",
    header: "Status",
    value: (r) => r.status,
    render: (r) => <StatusChip status={r.status} />,
  },
];

const SIG =
  "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z";

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      {(["info", "success", "error"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          onClick={() => toast.push({ message: `Toast demo · ${kind}`, kind })}
          className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
        >
          push {kind}
        </button>
      ))}
      <button
        type="button"
        onClick={() =>
          toast.push({
            message: "Coupon paid to 3 holders",
            kind: "success",
            signature: SIG,
          })
        }
        className="rounded border border-neutral-700 px-2 py-1 text-xs hover:border-neutral-500"
      >
        push with tx
      </button>
    </div>
  );
}

/** Interactive part of the kitchen sink: sorting, copy buttons, toasts. */
export function KitchenSinkDemo() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          DataTable · sortable, mono columns
        </h2>
        <DataTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => r.owner}
          initialSort={{ key: "units", dir: "desc" }}
        />
      </div>
      <div>
        <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          ExplorerLink · copy buttons
        </h2>
        <div className="space-y-1 font-mono text-xs">
          <div>
            address <ExplorerLink value={OWNER_A} kind="address" />
          </div>
          <div>
            tx <ExplorerLink value={SIG} kind="tx" />
          </div>
          <div>
            custom label{" "}
            <ExplorerLink value={OWNER_B} kind="address" label="explorer ↗" />
          </div>
        </div>
      </div>
      <div>
        <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          Toast · click to trigger
        </h2>
        <ToastDemo />
      </div>
    </div>
  );
}
