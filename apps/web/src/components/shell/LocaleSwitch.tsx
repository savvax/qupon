"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/ui/cx";

/** Codes shown in the control; KZ is the conventional short form of kk (Kazakh). */
const CHOICES = [
  { locale: "en", label: "EN" },
  { locale: "ru", label: "RU" },
  { locale: "kk", label: "KZ" },
] as const;

/**
 * Segmented EN | RU | KZ radio group: persists the choice via /api/locale and refreshes the server tree. The static
 * proof export (no server) passes `onChoose` and switches its messages on the client instead.
 */
export function LocaleSwitch({ onChoose }: { onChoose?: (locale: string) => void } = {}) {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const choose = (next: string) => {
    if (next === locale || pending) return;
    if (onChoose) return onChoose(next);
    void fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).then(() => startTransition(() => router.refresh()));
  };
  const checked = CHOICES.some((c) => c.locale === locale);
  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className="inline-flex h-9 items-center gap-0.5 rounded-btn border border-n300 bg-n0 p-0.5 sm:h-8"
    >
      {CHOICES.map((c, i) => (
        <button
          key={c.locale}
          type="button"
          role="radio"
          aria-checked={locale === c.locale}
          aria-label={
            c.label === "KZ"
              ? "Қазақша"
              : c.label === "RU"
                ? "Русский"
                : "English"
          }
          tabIndex={locale === c.locale || (!checked && i === 0) ? 0 : -1}
          onClick={() => choose(c.locale)}
          disabled={pending}
          className={cx(
            "h-8 min-w-8 rounded-sm px-2 text-xs font-bold uppercase transition-colors sm:h-7",
            locale === c.locale
              ? "bg-g600 text-white"
              : "text-n600 hover:bg-n50 hover:text-n900",
          )}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}
