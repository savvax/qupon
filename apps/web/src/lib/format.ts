/** Shorten a base58 pubkey for display: 4 head + 4 tail chars. */
export function shortKey(key: string, head = 4, tail = 4): string {
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/** YYYY-MM-DD in Asia/Almaty from an ISO 8601 string (API sends +05:00). */
/**
 * A user-facing date in Asia/Almaty: RU "01.03.2027", EN "Mar 1, 2027". Without a locale: "2027-03-01"
 * (machine-ish contexts and tests).
 */
export function formatDate(iso: string, locale?: string): string {
  if (!locale)
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Almaty",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-US", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: locale === "ru" ? "2-digit" : "short",
    day: locale === "ru" ? "2-digit" : "numeric",
  }).format(new Date(iso));
}

/** Date and 24 h time in Asia/Almaty: RU "01.03.2027, 14:00", EN "Mar 1, 2027, 14:00"; no locale → "2027-03-01 14:00". */
export function formatDateTime(iso: string, locale?: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return locale
    ? `${formatDate(iso, locale)}, ${time}`
    : `${formatDate(iso)} ${time}`;
}

/** 1000 bps → "10.00%" (EN) / "10,00 %" (RU). */
export function bpsToPercent(bps: number, locale: "en" | "ru" = "en"): string {
  const n = new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bps / 100);
  return locale === "ru" ? `${n}\u00a0%` : `${n}%`;
}

const FREQUENCIES: Record<"en" | "ru", Record<number, string>> = {
  en: { 1: "annual", 2: "semi-annual", 4: "quarterly", 12: "monthly" },
  ru: {
    1: "раз в год",
    2: "раз в полгода",
    4: "ежеквартально",
    12: "ежемесячно",
  },
};

export function frequencyLabel(
  frequency: number,
  locale: "en" | "ru" = "en",
): string {
  return (
    FREQUENCIES[locale][frequency] ??
    (locale === "ru" ? `${frequency} раз в год` : `${frequency}×/yr`)
  );
}

/** Amount rendering is the API's `display` string — keep monospace. */
export function formatAmount(amount: { display: string }): string {
  return amount.display;
}

/** Minor-unit decimals per settlement currency; unknown currencies get 2. */
export function currencyDecimals(currency: string): number {
  switch (currency) {
    case "USDC":
    case "tUSDC":
      return 6;
    default:
      return 2; // KZT, tKZT and anything else the registrar throws at us
  }
}

/** "100000" @ 2 → "1,000.00" (BigInt-safe, exact: minor units carry no rounding). */
export function formatMinor(minor: string, decimals: number): string {
  const n = BigInt(minor);
  const abs = n < 0n ? -n : n;
  const base = 10n ** BigInt(decimals);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = (abs % base).toString().padStart(decimals, "0");
  return `${n < 0n ? "-" : ""}${whole}${decimals > 0 ? `.${frac}` : ""}`;
}

/** "1,000.00 KZT" → ["1,000.00", "KZT"]. Display without a unit → [display, ""]. */
export function splitAmountDisplay(display: string): [string, string] {
  const m = display.trim().match(/^(.+?)(?:\s+([A-Za-z][A-Za-z0-9]{1,9}))?$/);
  return m ? [m[1] ?? display, m[2] ?? ""] : [display, ""];
}
