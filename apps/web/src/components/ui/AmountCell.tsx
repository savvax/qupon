// Minimal stub — replaced by the full UI kit in task 050 (keep props stable).
import type { Amount } from "@/lib/api";

export function AmountCell({
  amount,
  className = "",
}: {
  amount?: Amount;
  className?: string;
}) {
  if (!amount) return <span className="font-mono text-neutral-600">—</span>;
  return (
    <span className={`font-mono tabular-nums ${className}`}>{amount.display}</span>
  );
}
