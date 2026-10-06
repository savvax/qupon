/** Exact decimal formatting from integer minor units (no float), grouped per locale. */
export function formatAmount(
  minor: string | bigint | number,
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

/** "10,000.00" / "10000.5" (API major-unit string) → integer minor units for <Amount>. */
export function majorToMinor(major: string, decimals: number): bigint {
  const s = major.trim().replace(/,/g, "");
  const neg = s.startsWith("-");
  const [w = "0", f = ""] = s.replace("-", "").split(".");
  const frac = (f + "0".repeat(decimals)).slice(0, decimals);
  const n = BigInt(w || "0") * 10n ** BigInt(decimals) + BigInt(frac || "0");
  return neg ? -n : n;
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
