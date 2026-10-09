import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Address } from "@/components/ui/Address";
import { formatDateTime } from "@/lib/format";
import { cx } from "@/lib/ui/cx";
import { type Actor, ActorChip } from "./ActorChip";

export type FlowStepState =
  | "done"
  | "current"
  | "pending"
  | "failed"
  | "defaulted"
  | "skipped";

export type FlowStep = {
  id: string;
  /** Translated step name ("Record date", "Snapshot"). */
  label: string;
  state: FlowStepState;
  /** When it happened (ISO 8601), Almaty time. */
  at?: string | null;
  /** Signature of the step's (latest) transaction: explorer link + copy. */
  tx?: string | null;
  /** Who may push it; `anyone` renders the "Anyone can push" badge. */
  actor?: Actor;
  /** One short line under the step: "3 of 3 holders paid", "Σ 100 = supply". */
  detail?: ReactNode;
  /** Record step: the planned record time and when the boundary actually took effect. */
  record?: { planned: string; effective?: string | null };
  /** ISO 20022 and other files produced at this step. */
  downloads?: { label: string; href: string }[];
};

function Marker({ state, n }: { state: FlowStepState; n: number }) {
  const base =
    "relative z-10 grid size-6 shrink-0 place-items-center rounded-full text-micro font-bold";
  if (state === "done")
    return (
      <span aria-hidden className={cx(base, "bg-g600 text-white")}>
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="m3.5 8.5 3 3 6-7" />
        </svg>
      </span>
    );
  if (state === "failed" || state === "defaulted")
    return (
      <span aria-hidden className={cx(base, "bg-default text-white")}>
        !
      </span>
    );
  if (state === "current")
    return (
      <span aria-hidden className={cx(base, "qp-live border-2 border-g600 bg-n0 text-g700")}>
        {n}
      </span>
    );
  return (
    <span
      aria-hidden
      className={cx(
        base,
        "border-2 border-n300 bg-n0 text-n500",
        state === "skipped" && "border-dashed",
      )}
    >
      {n}
    </span>
  );
}

/**
 * A corporate action as a row of steps (record → snapshot → fund → pay → complete …), each with its time, its
 * transaction, who may push it and what it produced. Horizontal when its container is ≥ 56 rem wide, a vertical
 * rail below that — nothing is truncated at any width.
 */
export function ActionFlow({
  steps,
  locale,
  className,
}: {
  steps: FlowStep[];
  locale: "en" | "ru";
  className?: string;
}) {
  const t = useTranslations("kit.flow");
  const delta = (planned: string, effective: string) =>
    Math.round(
      (new Date(effective).getTime() - new Date(planned).getTime()) / 1000,
    );
  return (
    <div className={cx("@container", className)}>
      <ol className="grid @4xl:auto-cols-[minmax(0,1fr)] @4xl:grid-flow-col">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li
              key={s.id}
              aria-current={s.state === "current" ? "step" : undefined}
              className="relative flex gap-3 pb-5 last:pb-0 @4xl:flex-col @4xl:gap-2.5 @4xl:pr-4 @4xl:pb-0"
            >
              {!last && (
                <span
                  aria-hidden
                  className={cx(
                    "absolute top-7 bottom-1 left-[11px] w-0.5 rounded-full @4xl:top-[11px] @4xl:right-2 @4xl:bottom-auto @4xl:left-8 @4xl:h-0.5 @4xl:w-auto",
                    s.state === "done" ? "bg-g500" : "bg-n200",
                  )}
                />
              )}
              <Marker state={s.state} n={i + 1} />
              <div className="min-w-0 flex-1 text-dense">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cx(
                      "font-bold",
                      s.state === "pending" || s.state === "skipped"
                        ? "text-n500"
                        : s.state === "defaulted" || s.state === "failed"
                          ? "text-default"
                          : "text-n900",
                    )}
                  >
                    {s.label}
                  </span>
                  {s.state === "current" && (
                    <span className="rounded-full bg-p900 px-1.5 text-micro font-bold text-white">
                      {t("state.current")}
                    </span>
                  )}
                  {(s.state === "defaulted" || s.state === "failed") && (
                    <span className="rounded-full bg-default px-1.5 text-micro font-bold text-white">
                      {t(`state.${s.state}`)}
                    </span>
                  )}
                </div>
                {s.at && (
                  <div className="num mt-0.5 text-n600">
                    {formatDateTime(s.at, locale)}
                  </div>
                )}
                {s.record && (
                  <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 text-micro text-n600">
                    <dt>{t("planned")}</dt>
                    <dd className="num text-n900">
                      {formatDateTime(s.record.planned, locale)}
                    </dd>
                    {s.record.effective && (
                      <>
                        <dt>{t("effective")}</dt>
                        <dd className="num text-n900">
                          {formatDateTime(s.record.effective, locale)}{" "}
                          {(() => {
                            const d = delta(s.record.planned, s.record.effective);
                            return d <= 0 ? (
                              <span className="font-bold text-g700">
                                {t("onTime")}
                              </span>
                            ) : (
                              <span className="font-bold text-warn-fg">
                                {t("late", { s: d })}
                              </span>
                            );
                          })()}
                        </dd>
                      </>
                    )}
                  </dl>
                )}
                {s.detail && <div className="mt-0.5 text-n600">{s.detail}</div>}
                {s.tx && (
                  <div className="mt-1">
                    <Address value={s.tx} kind="tx" />
                  </div>
                )}
                {(s.actor || s.downloads?.length) && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    {s.actor && s.state !== "done" && (
                      <ActorChip actor={s.actor} long />
                    )}
                    {s.downloads?.map((d) => (
                      <a
                        key={d.href}
                        href={d.href}
                        className="inline-flex h-6 items-center gap-1 rounded-full border border-n200 bg-n0 px-2 text-micro font-bold text-g700 hover:border-g300"
                      >
                        <svg viewBox="0 0 16 16" aria-hidden className="size-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M8 3v7m0 0-3-3m3 3 3-3M3 13h10" />
                        </svg>
                        {d.label}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
