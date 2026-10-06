/** Exact decimal formatting from integer minor units (no float), grouped per locale. */
export function formatAmount(
  minor: string | bigint,
  decimals: number,
  locale: "en" | "ru",
): string {
  const n = BigInt(minor);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const base = 10n ** BigInt(decimals);
  const sep = locale === "ru" ? " " : ",";
  const dot = locale === "ru" ? "," : ".";
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  // Trailing zeros past the cents are noise (USDC: 1,000.000000 → 1,000.00); significant digits stay.
  const digits =
    decimals > 0
      ? (abs % base).toString().padStart(decimals, "0").replace(/0+$/, "")
      : "";
  const frac =
    decimals > 0 ? dot + digits.padEnd(Math.min(2, decimals), "0") : "";
  return `${neg ? "-" : ""}${whole}${frac}`;
}

export const CURRENCY_SIGN: Record<string, string> = {
  tKZT: "₸",
  KZT: "₸",
  USDC: "USDC",
};
export const CURRENCY_DECIMALS: Record<string, number> = {
  tKZT: 2,
  KZT: 2,
  USDC: 6,
};
