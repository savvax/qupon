/** Shorten a base58 pubkey for display: 4 head + 4 tail chars. */
export function shortKey(key: string, head = 4, tail = 4): string {
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

import { type Locale } from "@/i18n/locale";

/**
 * A user-facing date in Asia/Almaty: RU/KK "01.03.2027", EN "Mar 1, 2027". Without a locale: "2027-03-01"
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
  // kk shares ru's numeric dd.mm.yyyy. Not "kk-KZ": Node's ICU prints 11.04.2027, Chrome 2027-04-11, so a client
  // component formatting a date hydrated with a mismatch on every kk page.
  const intl = locale === "en" ? "en-US" : "ru-RU";
  const eu = locale !== "en";
  return new Intl.DateTimeFormat(intl, {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: eu ? "2-digit" : "short",
    day: eu ? "2-digit" : "numeric",
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

/** KASE and dossier dates arrive as Almaty civil time with no zone ("2026-09-18T19:38:00",
 * "2026-10-05 16:59:40") or as a plain date. Stamp +05:00 on anything offset-less so a UTC
 * host never parses 19:38 as UTC and shifts the rendered day (pre-flight #17, review round 2). */
export function civilDate(iso: string): string {
  if (iso.length <= 10) return `${iso}T00:00:00+05:00`;
  return /(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso)
    ? iso
    : `${iso.replace(" ", "T")}+05:00`;
}

/** Grouped integer (slots, counts): EN "288,123,456", RU/KK "288 123 456". One path for every slot
 * and count in the UI — kk groups like ru, so the footer chip never shows "1,249" next to "1 249". */
export function formatInt(n: number, locale?: string): string {
  // one grouping path (pre-flight #17): delegate to formatGroupedInt
  return formatGroupedInt(n, locale === "ru" || locale === "kk" ? locale : "en");
}

/** Fixed-precision decimal per locale: EN "4.213", RU/KK "4,213" — SOL balances must not show a dot
 * decimal next to ru-grouped slots on the same card (pre-flight #32). */
export function formatDecimal(
  n: number,
  digits: number,
  locale?: string,
): string {
  return new Intl.NumberFormat(
    locale === "ru" || locale === "kk" ? "ru-RU" : "en-US",
    { minimumFractionDigits: digits, maximumFractionDigits: digits },
  ).format(n);
}

/** 1000 bps → "10.00%" (EN) / "10,00 %" (RU, KK). */
export function bpsToPercent(bps: number, locale: Locale = "en"): string {
  const n = new Intl.NumberFormat(locale === "en" ? "en" : "ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(bps / 100);
  return locale === "en" ? `${n}%` : `${n}\u00a0%`;
}

/** Grouped integer (slots, counts): EN "288,123,456", RU/KK "288 123 456" — one grouping per locale. */
export function formatGroupedInt(n: number, locale: Locale = "en"): string {
  return n.toLocaleString(locale === "en" ? "en-US" : "ru-RU");
}

const FREQUENCIES: Record<Locale, Record<number, string>> = {
  en: { 1: "annual", 2: "semi-annual", 4: "quarterly", 12: "monthly" },
  ru: {
    1: "раз в год",
    2: "раз в полгода",
    4: "ежеквартально",
    12: "ежемесячно",
  },
  kk: {
    1: "жыл сайын",
    2: "жарты жылда бір",
    4: "тоқсан сайын",
    12: "ай сайын",
  },
};

export function frequencyLabel(
  frequency: number,
  locale: Locale = "en",
): string {
  return (
    FREQUENCIES[locale][frequency] ??
    (locale === "en"
      ? `${frequency}×/yr`
      : locale === "ru"
        ? `${frequency} раз в год`
        : `жылына ${frequency} рет`)
  );
}

/** Amount rendering is the API's `display` string — keep monospace. */
export function formatAmount(amount: { display: string }): string {
  return amount.display;
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
