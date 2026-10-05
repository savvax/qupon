"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cx } from "@/lib/ui/cx";

/** KASE-style disclosure notice in EN/RU with copy. Publication on kase.kz is simulated. */
export function NoticePanel({ en, ru }: { en: string; ru: string }) {
  const t = useTranslations("action.notice");
  const [lang, setLang] = useState<"en" | "ru">("en");
  const [copied, setCopied] = useState(false);
  const text = lang === "en" ? en : ru;
  return (
    <div className="rounded-card border border-n200 bg-n0 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{t("title")}</h3>
        <div
          role="group"
          aria-label={t("language")}
          className="inline-flex rounded-btn bg-n100 p-0.5"
        >
          {(["en", "ru"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lang === l}
              onClick={() => setLang(l)}
              className={cx(
                "h-7 rounded-sm px-2.5 text-xs font-bold uppercase",
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
