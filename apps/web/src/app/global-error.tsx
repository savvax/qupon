"use client";

import { useEffect, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import { CrashState } from "@/components/CrashState";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";

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
  const [locale, setLocale] = useState<"en" | "ru">("en");
  useEffect(() => {
    if (/(?:^|;\s*)NEXT_LOCALE=ru/.test(document.cookie)) setLocale("ru");
  }, []);
  return (
    <html lang={locale}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider
          locale={locale}
          messages={locale === "ru" ? ru : en}
        >
          <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
            <CrashState error={error} reset={reset} />
          </div>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
