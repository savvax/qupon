import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StableLabel } from "@/components/i18n/StableLabel";
import { cx } from "@/lib/ui/cx";
import { type Actor, ActorChip } from "./ActorChip";

const TONE = {
  default: "border-n200 bg-n0",
  attention: "border-warn-bd bg-warn-bg",
  danger: "border-default bg-err-bg",
  done: "border-g200 bg-g50",
} as const;

const PILL = {
  default: "bg-p900 text-white",
  attention: "bg-warn-fg text-white",
  danger: "bg-default text-white",
  done: "bg-g600 text-white",
} as const;

/**
 * "Now": the one thing that happens next on this page, who may do it, and one primary button. Inline at the top
 * of the content from 768 px; docked to the bottom of the screen on phones (above the cabinet tab bar with
 * `dock="tabbar"`); globals.css pads the page bottom while one is docked, so it never covers the last row.
 */
export function NowBar({
  title,
  detail,
  actors = [],
  action,
  clock,
  tone = "default",
  dock = "page",
  className,
}: {
  /** One sentence: what happens next. */
  title: ReactNode;
  /** Optional second line (amounts, why it waits). */
  detail?: ReactNode;
  actors?: Actor[];
  /** The single primary button (or a link styled as one). */
  action?: ReactNode;
  /** A CountdownClock or a date. */
  clock?: ReactNode;
  tone?: keyof typeof TONE;
  /** Phones: docked to the screen bottom (`page`), above the cabinet tab bar (`tabbar`) or inline (`none`). */
  dock?: "page" | "tabbar" | "none";
  className?: string;
}) {
  const t = useTranslations("kit");
  return (
    <>
      <section
        aria-label={t("now.label")}
        data-nowbar={dock}
        className={cx(
          "z-30 flex flex-col gap-3 border p-3 sm:p-4 md:flex-row md:items-center md:gap-5 md:rounded-card",
          // phones: docked bar, full width, raised above the content
          dock !== "none" &&
            "max-md:fixed max-md:inset-x-0 max-md:border-x-0 max-md:border-b-0 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:shadow-dock",
          dock === "tabbar" && "max-md:bottom-16",
          dock === "page" && "max-md:bottom-0",
          dock === "none" && "rounded-card",
          TONE[tone],
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span
            className={cx(
              "mt-0.5 inline-flex h-6 shrink-0 items-center rounded-full px-2 text-micro font-extrabold",
              PILL[tone],
            )}
          >
            <StableLabel>{tone === "done" ? t("now.done") : t("now.label")}</StableLabel>
          </span>
          {/* flex-1: the title's box is the space left, not its text, so it keeps its size in every language */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-n900 sm:text-base">
              {title}
            </p>
            {(detail || clock) && (
              // phones: detail and clock on their own lines, so the docked bar keeps one height in every language
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-n600 max-sm:flex-col max-sm:items-start sm:text-sm">
                {detail && <span className="min-w-0">{detail}</span>}
                {clock}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 max-md:justify-between">
          {actors.length > 0 && (
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-n500 max-sm:sr-only">
                <StableLabel align="end">{t("actor.label")}</StableLabel>
              </span>
              {actors.map((a) => (
                <ActorChip key={a} actor={a} />
              ))}
            </span>
          )}
          {action && <span className="shrink-0">{action}</span>}
        </div>
      </section>
    </>
  );
}
