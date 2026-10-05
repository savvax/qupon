import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
export default getRequestConfig(async () => {
  const c = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = c === "ru" ? "ru" : "en";
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
