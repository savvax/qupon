/**
 * Alternate-locale labels (spec §5.8): for every short UI string of the current locale, the matching string of each
 * OTHER locale (joined by ALT_SEP), so a control can reserve the width of all of them and never move when the
 * language changes. One alternate is not enough with three locales: "longest by characters" is not "widest". Keys are the current-locale texts; a text used for several keys keeps the longest
 * alternative. Templates with simple `{var}` placeholders are kept (filled by StableLabel); plural/select are not.
 */
export type AltLabelMap = Record<string, string>;

/** Separates the alternates of one text in an AltLabelMap value (StableLabel reserves each). */
export const ALT_SEP = "\u001f";

// ponytail: every UI text up to 240 chars ships to the client (~20 kB gzipped); send only the page's texts if
// the payload ever matters.
const MAX = 240;
const ICU = /\{\s*\w+\s*,\s*(plural|select|selectordinal)/;

export function altLabelMap(
  current: Record<string, unknown>,
  ...alternates: Record<string, unknown>[]
): AltLabelMap {
  // per text: one slot per alternate locale (the longest when a text maps to several keys)
  const per: Record<string, string[]> = {};
  const walk = (c: unknown, a: unknown, i: number) => {
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
        const slots = (per[v] ??= []);
        if (!slots[i] || alt.length > slots[i].length) slots[i] = alt;
      } else walk(v, alt, i);
    }
  };
  alternates.forEach((alternate, i) => walk(current, alternate, i));
  return Object.fromEntries(
    Object.entries(per).map(([k, v]) => [k, [...new Set(v.filter(Boolean))].join(ALT_SEP)]),
  );
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
