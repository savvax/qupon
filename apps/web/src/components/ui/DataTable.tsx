import type { ReactNode } from "react";
import { Stagger, StaggerItem } from "@/components/motion/Stagger";
import { cx } from "@/lib/ui/cx";
import { cellShownFrom, visibleColumns, type Bp } from "@/lib/ui/table";

export type Column<T> = {
  key: string;
  header: ReactNode;
  align?: "left" | "right";
  render: (row: T) => ReactNode;
  /** Hidden below the breakpoint (table cells); also dropped from the mobile cards unless `essential`. */
  hideBelow?: Bp;
  /** Always shown in the phone card (amounts, status, tx/download) even when the table hides it at mid widths. */
  essential?: boolean;
};

/**
 * Responsive data table: a real `<table>` from 640 px up, stacked cards below.
 * Safe in server and client components; rows stagger in via components/motion (task 1102).
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  phoneRow,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  /** Compact phone card (e.g. two lines for a log) instead of one header → value line per column. */
  phoneRow?: (row: T) => ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-n300 bg-n0 px-6 py-10 text-center text-sm text-n600">
        {empty}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-card border border-n200 bg-n0">
      {/* ≥ 640 px: real table; per-column hideBelow via responsive cell classes */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-n200 bg-n50 text-left text-[11px] font-bold uppercase tracking-[0.06em] text-n500">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cx(
                    "px-4 py-3",
                    col.align === "right" && "text-right",
                    col.hideBelow && cellShownFrom(col.hideBelow),
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <Stagger as="tbody">
            {rows.map((row, i) => (
              <StaggerItem
                as="tr"
                key={rowKey(row)}
                index={i}
                className="relative border-b border-n100 transition-colors last:border-0 hover:bg-n50/60"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cx(
                      "px-4 py-3 align-middle",
                      col.align === "right" && "text-right",
                      col.hideBelow && cellShownFrom(col.hideBelow),
                    )}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </StaggerItem>
            ))}
          </Stagger>
        </table>
      </div>
      {/* < 640 px: one card per row, same columns minus those hidden below sm */}
      <Stagger as="ul" className="divide-y divide-n100 sm:hidden">
        {rows.map((row, i) => (
          <StaggerItem
            as="li"
            key={rowKey(row)}
            index={i}
            className={phoneRow ? "px-4 py-3" : "space-y-1.5 px-4 py-4"}
          >
            {phoneRow
              ? phoneRow(row)
              : columns
                  .filter(
                    (c) => c.essential || visibleColumns([c], "sm").length,
                  )
                  .map((col) => (
                    <div
                      key={col.key}
                      className="flex items-baseline justify-between gap-4"
                    >
                      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em] text-n500">
                        {col.header}
                      </span>
                      <span
                        className={cx(
                          "min-w-0 text-right text-sm",
                          col.align === "right" && "num",
                        )}
                      >
                        {col.render(row)}
                      </span>
                    </div>
                  ))}
          </StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
