/** Exact display of a minor-unit amount (no rounding): (50000n, 2, "tKZT") → "500.00 tKZT"; (10n, 0, "QPNb1") → "10 QPNb1". */
export function formatMinor(amount: bigint, decimals: number, symbol: string): string {
  if (!Number.isInteger(decimals) || decimals < 0) throw new Error(`decimals must be an integer >= 0, got ${decimals}`);
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const frac = decimals > 0 ? "." + (abs % scale).toString().padStart(decimals, "0") : "";
  return `${neg ? "-" : ""}${(abs / scale).toString()}${frac} ${symbol}`;
}

/** Unix seconds → Asia/Almaty (UTC+5) formatted timestamp, e.g. "2026-10-12 20:00:00 +05". */
export function formatAlmaty(unix: number | bigint): string {
  const ms = Number(unix) * 1000;
  const d = new Date(ms + 5 * 3600 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +05`;
}
