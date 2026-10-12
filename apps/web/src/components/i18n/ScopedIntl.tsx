import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { altLabelMap } from "@/i18n/altLabels";
import { LOCALES, type Locale } from "@/i18n/locale";
import { loadMessages } from "@/i18n/request";
import { scopedIntl } from "@/i18n/scoped";
import { AltLabelsProvider } from "./StableLabel";

/**
 * Route-scoped replacement for the kitchen-sink client provider (task 91575): ships only the message paths the
 * route's client tree reads, plus the alt-label map of exactly those paths, instead of every namespace of every
 * feature (468 KB of the 676 KB landing HTML). Server components are unaffected — getTranslations reads the
 * request config. Omit `paths` for the full set (cabinets keep it).
 */
export async function ScopedIntl({
  paths,
  mapPaths,
  children,
}: {
  paths?: readonly string[];
  /** Alt-label map scope when it is narrower than `paths` (texts that are never stabilized need no map). */
  mapPaths?: readonly string[];
  children: ReactNode;
}) {
  const locale = (await getLocale()) as Locale;
  const { messages, altLabels } = paths
    ? await scopedIntl(locale, paths, mapPaths)
    : await fullIntl(locale);
  return (
    <NextIntlClientProvider messages={messages}>
      <AltLabelsProvider map={altLabels}>{children}</AltLabelsProvider>
    </NextIntlClientProvider>
  );
}
/** The full set: every namespace and the alt-label map built from all locales (pre-91575 behavior). */
async function fullIntl(locale: Locale) {
  const others = LOCALES.filter((l) => l !== locale);
  const [current, alts] = await Promise.all([
    loadMessages(locale),
    Promise.all(others.map((l) => loadMessages(l))),
  ]);
  return { messages: current, altLabels: altLabelMap(current, ...alts) };
}
