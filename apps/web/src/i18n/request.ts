import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
export const LOCALES = ["en", "ru"] as const;
export type Locale = (typeof LOCALES)[number];
/** Platform v2 feature namespaces, one file each in messages/<locale>/<ns>.json (parallel tasks never collide). */
export const NAMESPACES = [
  "admin",
  "account",
  "kyc",
  "notify",
  "org",
  "reports",
  "kase",
  "assets",
  "network",
  "wallet",
  "onboarding",
  "trades",
  "termsheet",
  "kit",
  "sandbox",
] as const;
/** All messages of a locale: the base file plus every feature namespace file. */
export async function loadMessages(locale: Locale) {
  const base = (await import(`../../messages/${locale}.json`)).default;
  const parts = await Promise.all(
    NAMESPACES.map(
      async (ns) =>
        [
          ns,
          (await import(`../../messages/${locale}/${ns}.json`)).default,
        ] as const,
    ),
  );
  return { ...base, ...Object.fromEntries(parts) } as Record<string, unknown>;
}

export default getRequestConfig(async () => {
  const c = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale: Locale = c === "ru" ? "ru" : "en";
  return { locale, messages: await loadMessages(locale) };
});
