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
              "relative grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-[background-color,color,scale] duration-300",
              s.state === "done" && "bg-g600 text-white",
              s.state === "current" &&
                "animate-qp-ring bg-n0 text-g700 ring-2 ring-g600 ring-inset",
              s.state === "todo" && "bg-n100 text-n500",
            )}
          >
            {/* The check is always in the DOM so becoming "done" draws it (stroke transition). */}
            <svg viewBox="0 0 16 16" className="absolute size-3.5" fill="none">
              <path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="14"
                className={cx(
                  "transition-[stroke-dashoffset] delay-150 duration-500 ease-[cubic-bezier(.65,0,.35,1)]",
                  s.state === "done"
                    ? "[stroke-dashoffset:0]"
                    : "[stroke-dashoffset:14]",
                )}
              />
            </svg>
            {s.state !== "done" && i + 1}
          </span>
          <span aria-current={s.state === "current" ? "step" : undefined}>
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className="relative ml-1 hidden h-0.5 w-8 overflow-hidden rounded bg-n200 lg:block xl:w-14"
            >
              <span
                className={cx(
                  "absolute inset-0 origin-left bg-g400 transition-[scale] duration-500 ease-[cubic-bezier(.2,.8,.2,1)]",
                  s.state === "done" ? "scale-x-100" : "scale-x-0",
                )}
              />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}
