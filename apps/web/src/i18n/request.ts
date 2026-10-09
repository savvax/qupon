import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { type Locale, toLocale } from "./locale";

export { LOCALES, type Locale } from "./locale";

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
  "learn",
] as const;

/** All messages of a locale: the base file plus every feature namespace file. */
export async function loadMessages(locale: Locale) {
  const base = (await import(`../../messages/${locale}.json`)).default;
  const parts = await Promise.all(
    NAMESPACES.map(
      async (ns) => [ns, await loadNamespace(locale, ns)] as const,
    ),
  );
  return { ...base, ...Object.fromEntries(parts) } as Record<string, unknown>;
}

/** A locale's namespace file. Every locale ships every file; messages.test.ts gates the key sets. */
async function loadNamespace(locale: Locale, ns: string) {
  return (await import(`../../messages/${locale}/${ns}.json`)).default;
}

export default getRequestConfig(async () => {
  const c = (await cookies()).get("NEXT_LOCALE")?.value;
  const locale = toLocale(c);
  return { locale, messages: await loadMessages(locale) };
});
