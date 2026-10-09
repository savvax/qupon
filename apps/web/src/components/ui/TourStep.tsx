"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "./Button";

/**
 * One coach mark of a guided tour: step counter, a title, one or two sentences, Back / Next and a skip link.
 * Presentational: the page owns the step index (and where the card sits); the target is marked with
 * data-tour-active="true" for the ring.
 */
export function TourStep({
  step,
  total,
  title,
  children,
  onBack,
  onNext,
  onSkip,
}: {
  /** 1-based */
  step: number;
  total: number;
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  onSkip?: () => void;
}) {
  const t = useTranslations("kit.tour");
  const last = step >= total;
  return (
    <div
      role="dialog"
      aria-label={title}
      className="w-full max-w-sm rounded-card border border-n200 bg-n0 p-4 shadow-raise"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="num text-xs font-semibold text-n500">
          {t("stepOf", { n: step, total })}
        </span>
        {onSkip && !last && (
          <button
            type="button"
            onClick={onSkip}
            className="rounded-sm px-1 text-xs font-semibold text-n600 underline underline-offset-2 hover:text-n900"
          >
            {t("skip")}
          </button>
        )}
      </div>
      {/* progress: one segment per step */}
      <div aria-hidden className="mt-2 flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full ${i < step ? "bg-g500" : "bg-n100"}`}
          />
        ))}
      </div>
      <h3 className="mt-3 font-bold text-n900">{title}</h3>
      <div className="mt-1 text-sm leading-relaxed text-n700">{children}</div>
      <div className="mt-4 flex justify-end gap-2">
        {onBack && step > 1 && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            {t("back")}
          </Button>
        )}
        {onNext && (
          <Button size="sm" onClick={onNext}>
            {last ? t("done") : t("next")}
          </Button>
        )}
      </div>
    </div>
  );
}
