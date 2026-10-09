/** The one place that knows which locales exist (base files messages/<locale>.json). */
export const LOCALES = ["en", "ru", "kk"] as const;
export type Locale = (typeof LOCALES)[number];

/** Coerce anything cookie/API-shaped (unknown string, undefined) into a valid locale; default en. */
export function toLocale(value: string | null | undefined): Locale {
  return (LOCALES as readonly string[]).includes(value ?? "")
    ? (value as Locale)
    : "en";
}
