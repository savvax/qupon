import { getTranslations } from "next-intl/server";

/** Per-page <title> text; the root layout metadata appends the "· Qupon" template. */
export async function metaTitle(
  key: string,
  values?: Record<string, string | number>,
): Promise<string> {
  const t = await getTranslations("meta");
  return t(key, values);
}
