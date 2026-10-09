/**
 * Alternate-locale labels (spec §5.8): for every short UI string of the current locale, the longest of the
 * matching strings of every OTHER locale, so a control can reserve the width of the longest one and never move
 * when the language changes. Keys are the current-locale texts; a text used for several keys keeps the longest
 * alternative. Templates with simple `{var}` placeholders are kept (filled by StableLabel); plural/select are not.
 */
export type AltLabelMap = Record<string, string>;

// ponytail: every UI text up to 240 chars ships to the client (~20 kB gzipped); send only the page's texts if
// the payload ever matters.
const MAX = 240;
const ICU = /\{\s*\w+\s*,\s*(plural|select|selectordinal)/;

export function altLabelMap(
  current: Record<string, unknown>,
  ...alternates: Record<string, unknown>[]
): AltLabelMap {
  const out: AltLabelMap = {};
  const walk = (c: unknown, a: unknown) => {
    if (!c || !a || typeof c !== "object" || typeof a !== "object") return;
    for (const [k, v] of Object.entries(c as Record<string, unknown>)) {
      const alt = (a as Record<string, unknown>)[k];
      if (typeof v === "string" && typeof alt === "string") {
        if (
          v === alt ||
          v.length > MAX ||
          alt.length > MAX ||
          ICU.test(v) ||
          ICU.test(alt)
        )
          continue;
        const prev = out[v];
        if (!prev || alt.length > prev.length) out[v] = alt;
      } else walk(v, alt);
    }
  };
  for (const alternate of alternates) walk(current, alternate);
  return out;
}

/** Fill `{var}` placeholders of a template. */
export function fill(
  template: string,
  values: Record<string, string | number> = {},
): string {
  return template.replace(/\{(\w+)\}/g, (m, k: string) =>
    k in values ? String(values[k]) : m,
  );
}
