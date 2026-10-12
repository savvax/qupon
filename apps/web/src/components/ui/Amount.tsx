import {
  CURRENCY_SIGN,
  formatAmount,
  renderDecimals,
  type AmountLike,
} from "@/lib/ui/amount";
import { cx } from "@/lib/ui/cx";
import { type Locale } from "@/i18n/locale";

/** Money from integer minor units: tabular figures, locale grouping, currency after the amount. */
export function Amount({
  minor,
  currency,
  decimals,
  locale = "en",
  className,
}: {
  minor: AmountLike;
  currency: string;
  decimals?: number;
  locale?: Locale;
  className?: string;
}) {
  // Decimals: explicit prop > API-carried `decimals`/`display` > the currency table (lib/ui/amount).
  const d = renderDecimals(minor, currency, decimals);
  const units = typeof minor === "object" ? minor.minor : minor;
  return (
    <span
      className={cx("num whitespace-nowrap", className)}
      title={`${units} minor units`}
    >
      {formatAmount(units, d, locale)}
      {/* NBSP, not a margin: the number–sign spacing survives copy/paste and text dumps (A91567-7) */}
      {"\u00a0"}
      <span className="text-[0.85em] font-medium text-n500">
        {CURRENCY_SIGN[currency] ?? currency}
      </span>
    </span>
  );
}
