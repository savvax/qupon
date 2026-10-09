"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { cx } from "@/lib/ui/cx";

const pad = (n: number) => String(n).padStart(2, "0");

/** "1 d 04 h", "04:12:09", "00:41" — the shortest form that still shows seconds when they matter. */
export function formatSpan(ms: number, days: (d: number, h: number) => string) {
  const s = Math.floor(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d >= 2) return days(d, h);
  if (d > 0 || h > 0) return `${d * 24 + h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/**
 * Live countdown to a deadline (record date, payment date, vote end). On a demo-clock series it says so and
 * converts what is left into bond days. Renders a fixed-width placeholder until mounted (no hydration drift).
 */
export function CountdownClock({
  to,
  label,
  daySecs,
  className,
}: {
  /** ISO 8601 or epoch ms. */
  to: string | number;
  label?: string;
  /** Demo clock: one bond day lasts this many real seconds (Series.day_secs); omit for a real-time series. */
  daySecs?: number;
  className?: string;
}) {
  const t = useTranslations("kit.clock");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const target = typeof to === "number" ? to : new Date(to).getTime();
  const left = now === null ? null : target - now;
  const days = (d: number, h: number) => t("days", { d, h });
  const text =
    left === null
      ? "--:--"
      : Math.abs(left) < 1000
        ? t("due")
        : left > 0
          ? t("in", { time: formatSpan(left, days) })
          : t("passed", { time: formatSpan(left, days) });
  return (
    <span className={cx("inline-flex flex-wrap items-center gap-x-2 gap-y-1", className)}>
      {label && <span className="text-n600">{label}</span>}
      <span
        className={cx(
          "num inline-block min-w-[7ch] font-bold",
          left !== null && left <= 0 ? "text-n600" : "text-n900",
        )}
        aria-live="off"
      >
        {text}
      </span>
      {daySecs !== undefined && daySecs > 0 && (
        <span
          title={t("perDay", { s: daySecs })}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-demo-bd bg-demo-bg px-2 text-micro font-bold text-demo-fg"
        >
          <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0" />
          </svg>
          {t("demo")}
          {left !== null && left > 0 && (
            <span className="num font-semibold">
              · {t("bondDays", { n: Math.ceil(left / 1000 / daySecs) })}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
