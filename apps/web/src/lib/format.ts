/** Shorten a base58 pubkey for display: 4 head + 4 tail chars. */
export function shortKey(key: string, head = 4, tail = 4): string {
  if (key.length <= head + tail + 1) return key;
  return `${key.slice(0, head)}…${key.slice(-tail)}`;
}

/** YYYY-MM-DD in Asia/Almaty from an ISO 8601 string (API sends +05:00). */
export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Almaty",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** YYYY-MM-DD HH:mm in Asia/Almaty. */
export function formatDateTime(iso: string): string {
  const date = formatDate(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
  return `${date} ${time}`;
}

/** 1000 bps → "10.00%" */
export function bpsToPercent(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

const FREQUENCIES: Record<number, string> = {
  1: "annual",
  2: "semi-annual",
  4: "quarterly",
  12: "monthly",
};

export function frequencyLabel(frequency: number): string {
  return FREQUENCIES[frequency] ?? `${frequency}×/yr`;
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
