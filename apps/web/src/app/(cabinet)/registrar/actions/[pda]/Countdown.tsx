"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

/** Live "2 h 05 m left" until a deadline; "ended" afterwards. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const t = useTranslations("action.meeting");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return <span>{t("ended")}</span>;
  const s = Math.floor(left / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <span className="num">
      {t("left", {
        time:
          h >= 48
            ? t("days", { d: Math.floor(h / 24), h: h % 24 })
            : h > 0
              ? `${h}:${pad(m)}:${pad(sec)}`
              : `${m}:${pad(sec)}`,
      })}
    </span>
  );
}
