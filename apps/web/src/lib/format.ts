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
