import { StableText } from "@/components/i18n/StableLabel";
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
    <div className="flex h-full min-w-0 flex-col rounded-card border border-n200 bg-n0 px-5 py-4">
      {/* Two label lines reserved: values line up across a row whatever the language (§5.8). */}
      <div className="min-h-[2lh] text-xs font-semibold text-n500">
        {typeof label === "string" ? <StableText>{label}</StableText> : label}
      </div>
      <div className="num mt-1 text-xl font-bold">
        {typeof value === "string" || typeof value === "number" ? (
          <CountUp value={String(value)} />
        ) : (
          value
        )}
      </div>
      {hint && (
        <div className="mt-0.5 text-xs text-n500">
          {typeof hint === "string" ? <StableText>{hint}</StableText> : hint}
        </div>
      )}
    </div>
  );
}
