"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { CrashState } from "@/components/CrashState";
import { toLocale, type Locale } from "@/i18n/locale";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";

const CATALOGUES: Record<Locale, Record<string, unknown>> = { en, ru, kk };

/**
 * Last-resort boundary (root layout itself failed): ships its own <html>,
 * locale (read from the cookie after mount — the layout provider is gone)
 * and the message catalogues.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const c = /(?:^|;\s*)NEXT_LOCALE=([^;]+)/.exec(document.cookie)?.[1];
    setLocale(toLocale(c));
  }, []);
  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider locale={locale} messages={CATALOGUES[locale]}>
          <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
            <CrashState error={error} reset={reset} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
