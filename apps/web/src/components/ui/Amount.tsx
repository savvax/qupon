import {
  CURRENCY_DECIMALS,
  CURRENCY_SIGN,
  formatAmount,
} from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";

/** Money from integer minor units: tabular figures, locale grouping, currency after the amount. */
export function Amount({
  minor,
  currency,
  decimals,
  locale = "en",
  className,
}: {
  minor: string | bigint | number;
  currency: string;
  decimals?: number;
  locale?: "en" | "ru";
  className?: string;
}) {
  const d = decimals ?? CURRENCY_DECIMALS[currency] ?? 2;
  return (
    <span
      className={cx("num whitespace-nowrap", className)}
      title={`${minor} minor units`}
    >
      {formatAmount(minor, d, locale)}
      <span className="ml-1 text-[0.85em] font-medium text-n500">
        {CURRENCY_SIGN[currency] ?? currency}
      </span>
    </span>
  );
}
