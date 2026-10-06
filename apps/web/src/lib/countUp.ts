/** Pure helpers of <CountUp>: keep a formatted number's shape while its value animates. */

/** First number in a formatted string: "6,060 ₸" → prefix "", digits "6,060", suffix " ₸". */
export function splitNumber(value: string) {
  const m =
    /^(\D*?)(\d{1,3}(?:[, \u00a0\u202f]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(.*)$/su.exec(
      value,
    );
  if (!m) return null;
  const [, prefix = "", digits = "", suffix = ""] = m;
  const sep = /\d([, \u00a0\u202f])\d{3}/u.exec(digits)?.[1] ?? "";
  const decimals = digits.includes(".")
    ? (digits.split(".")[1]?.length ?? 0)
    : 0;
  const n = Number(digits.replace(/[, \u00a0\u202f]/gu, ""));
  if (!Number.isFinite(n)) return null;
  return { prefix, suffix, sep, decimals, n };
}

export function formatLike(
  x: number,
  { sep, decimals }: { sep: string; decimals: number },
) {
  const [int = "0", frac] = x.toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  return frac ? `${grouped}.${frac}` : grouped;
}
