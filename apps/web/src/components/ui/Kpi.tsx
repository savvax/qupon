import type { ReactNode } from "react";
import { CountUp } from "@/components/motion/CountUp";

export function Kpi({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-card border border-n200 bg-n0 px-5 py-4">
      <div className="text-xs font-semibold text-n500">{label}</div>
      <div className="num mt-1 truncate text-xl font-bold">
        {typeof value === "string" || typeof value === "number" ? (
          <CountUp value={String(value)} />
        ) : (
          value
        )}
      </div>
      {hint && <div className="mt-0.5 text-xs text-n500">{hint}</div>}
    </div>
  );
}
