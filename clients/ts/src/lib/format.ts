/** Format a minor-unit amount with half-up rounding to `decimals` places: (500n, 2, "tKZT") → "500.00 tKZT". */
export function formatMinor(amount: bigint, decimals: number, symbol: string): string {
  if (decimals < 0) throw new Error(`decimals must be >= 0, got ${decimals}`);
  const neg = amount < 0n;
  const abs = neg ? -amount : amount;
  const scale = 10n ** BigInt(decimals);
  const units = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, "0");
  if (decimals > 0) frac = frac.slice(0, decimals);
  return `${neg ? "-" : ""}${units.toString()}.${frac} ${symbol}`;
}

/** Unix seconds → Asia/Almaty (UTC+5) formatted timestamp, e.g. "2026-10-12 20:00:00 +05". */
export function formatAlmaty(unix: number | bigint): string {
  const ms = Number(unix) * 1000;
  const d = new Date(ms + 5 * 3600 * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +05`;
}
