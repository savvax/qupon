"use client";
import { useTransition } from "react";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { cx } from "@/lib/ui/cx";

/** Segmented EN | RU control: persists the choice via /api/locale and refreshes the server tree. */
export function LocaleSwitch() {
  const locale = useLocale();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const choose = (next: string) => {
    if (next === locale || pending) return;
    void fetch("/api/locale", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ locale: next }),
    }).then(() => startTransition(() => router.refresh()));
  };
  return (
    <div
      role="group"
      aria-label="Language"
      className="inline-flex h-8 items-center gap-0.5 rounded-btn border border-n300 bg-n0 p-0.5"
    >
      {(["en", "ru"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={locale === l}
          disabled={pending}
          className={cx(
            "h-7 rounded-sm px-2 text-xs font-bold uppercase",
            locale === l ? "bg-g600 text-white" : "text-n600 hover:bg-n50 hover:text-n900",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
