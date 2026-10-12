"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { type Locale } from "@/i18n/locale";
import { cx } from "@/lib/ui/cx";

/** KASE-style disclosure notice in EN/RU/KK with copy. Publication on kase.kz is simulated.
 * Opens on the visitor's locale (live-sweep A91567-4: a RU page must not show the EN template). */
export function NoticePanel({
  en,
  ru,
  kk,
  locale,
}: {
  en: string;
  ru: string;
  kk: string;
  locale: Locale;
}) {
  const t = useTranslations("action.notice");
  const [lang, setLang] = useState<Locale>(locale);
  const [copied, setCopied] = useState(false);
  const text = { en, ru, kk }[lang];
  return (
    <div className="rounded-card border border-n200 bg-n0 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t("title")}</h3>
        <div
          role="group"
          aria-label={t("language")}
          className="inline-flex rounded-btn bg-n100 p-0.5"
        >
          {(["en", "ru", "kk"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={cx(
                "h-8 min-w-10 rounded-sm px-2.5 text-xs font-bold uppercase",
                lang === l
                  ? "bg-n0 text-n900 shadow-sm"
                  : "text-n600 hover:text-n900",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <pre className="mt-3 max-h-64 overflow-auto rounded-btn bg-n50 p-3 text-xs leading-relaxed whitespace-pre-wrap text-n800">
        {text}
      </pre>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Badge tone="neutral">{t("simulated")}</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            navigator.clipboard.writeText(text).catch(() => undefined);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? t("copied") : t("copy")}
        </Button>
      </div>
    </div>
  );
}
