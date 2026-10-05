import type { Amount } from "@/lib/api";
import { currencyDecimals, formatMinor, splitAmountDisplay } from "@/lib/format";

/**
 * Right-aligned, monospaced money cell. Prefers the API's `display` string;
 * when absent, formats `minor` using decimals derived from the currency.
 */
export function AmountCell({
  amount,
  className = "",
}: {
  amount?: Amount;
  className?: string;
}) {
  if (!amount) return <span className="font-mono text-neutral-600">—</span>;
  const [value, unit] = amount.display
    ? splitAmountDisplay(amount.display)
    : [formatMinor(amount.minor, currencyDecimals(amount.currency)), amount.currency];
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {value}
      {unit && <span className="ml-1 text-[0.85em] text-neutral-500">{unit}</span>}
    </span>
  );
}
