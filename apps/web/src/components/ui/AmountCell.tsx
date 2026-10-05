import type { Amount } from "@/lib/api";
import {
  currencyDecimals,
  formatMinor,
  splitAmountDisplay,
} from "@/lib/format";

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
  const [raw, unit] = amount.display
    ? splitAmountDisplay(amount.display)
    : [
        formatMinor(amount.minor, currencyDecimals(amount.currency)),
        amount.currency,
      ];
  // The API's display is ungrouped ("105000.00"); group the integer part like formatMinor does.
  const value = raw.replace(/^-?\d+/, (whole) =>
    whole.replace(/\B(?=(\d{3})+(?!\d))/g, ","),
  );
  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {value}
      {unit && (
        <span className="ml-1 text-[0.85em] text-neutral-500">{unit}</span>
      )}
    </span>
  );
}
