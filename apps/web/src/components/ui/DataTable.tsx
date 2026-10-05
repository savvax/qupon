"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";

export type Column<T> = {
  key: string;
  header: ReactNode;
  /** Sort key: string or number. Numeric-aware compare keeps "0009" < "0010". */
  value: (row: T) => string | number;
  /** Cell renderer; defaults to the raw value. */
  render?: (row: T) => ReactNode;
  align?: "left" | "right";
  /** Monospace + tabular figures (pubkeys, amounts, dates). */
  mono?: boolean;
};

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
});

/** Sortable, dense data table. Client component: sort state is local. */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  initialSort,
  empty = "no rows",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  empty?: ReactNode;
}) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (typeof va === "number" && typeof vb === "number")
        return (va - vb) * dir;
      return collator.compare(String(va), String(vb)) * dir;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((s) =>
      s?.key === key
        ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return (
    <div className="overflow-x-auto rounded border border-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-800 bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-500">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-3 py-2 font-medium ${col.align === "right" ? "text-right" : ""}`}
                aria-sort={
                  sort?.key === col.key
                    ? sort.dir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  onClick={() => toggle(col.key)}
                  className="inline-flex items-center gap-1 hover:text-neutral-300"
                >
                  {col.header}
                  <span className="text-[9px] normal-case">
                    {sort?.key === col.key
                      ? sort.dir === "asc"
                        ? "▲"
                        : "▼"
                      : "↕"}
                  </span>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td
                className="px-3 py-2 text-neutral-600"
                colSpan={columns.length}
              >
                {empty}
              </td>
            </tr>
          )}
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-900/40"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`px-3 py-2 ${col.align === "right" ? "text-right" : ""} ${col.mono ? "font-mono text-xs tabular-nums" : ""}`}
                >
                  {col.render ? col.render(row) : col.value(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
