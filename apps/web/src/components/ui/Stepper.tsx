import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

export type Step = {
  key: string;
  label: ReactNode;
  state: "done" | "current" | "todo";
};

/** Lifecycle progress: done steps are green ticks, the current one is ringed, the rest muted. */
export function Stepper({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex items-center gap-x-3 overflow-x-auto rounded-card border border-n200 bg-n0 px-4 py-3 [scrollbar-width:thin] sm:px-6">
      {steps.map((s, i) => (
        <li
          key={s.key}
          className={cx(
            "flex shrink-0 items-center gap-2 text-[13px] font-semibold whitespace-nowrap",
            s.state === "todo" && "text-n500",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors duration-300",
              s.state === "done" && "bg-g600 text-white",
              s.state === "current" &&
                "animate-qp-ring bg-n0 text-g700 ring-2 ring-g600 ring-inset",
              s.state === "todo" && "bg-n100 text-n500",
            )}
          >
            {s.state === "done" ? "✓" : i + 1}
          </span>
          <span aria-current={s.state === "current" ? "step" : undefined}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={cx(
                "ml-1 hidden h-0.5 w-8 rounded transition-colors duration-300 lg:block xl:w-14",
                s.state === "done" ? "bg-g300" : "bg-n200",
              )}
            />
          )}
        </li>
      ))}
    </ol>
  );
}
