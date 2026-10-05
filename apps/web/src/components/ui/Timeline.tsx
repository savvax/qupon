import { ExplorerLink } from "./ExplorerLink";
import { formatDateTime } from "@/lib/format";

export type TimelineStep = {
  label: string;
  state: "done" | "current" | "pending" | "failed";
  detail?: string;
  /** tx signature of the step, when it executed on-chain */
  signature?: string | null;
  /** when the step happened (ISO 8601 with +05:00), shown in Almaty time */
  at?: string | null;
};

const DOTS: Record<TimelineStep["state"], string> = {
  done: "border-emerald-500 bg-emerald-500",
  current: "border-amber-400 bg-neutral-950 animate-pulse",
  pending: "border-neutral-700 bg-neutral-950",
  failed: "border-red-500 bg-red-500",
};

const LABELS: Record<TimelineStep["state"], string> = {
  done: "text-neutral-200",
  current: "text-amber-200",
  pending: "text-neutral-500",
  failed: "text-red-300",
};

/** Vertical action timeline: one line per lifecycle step, tx link when on-chain. */
export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={`mt-1.5 h-2.5 w-2.5 rounded-full border ${DOTS[step.state]}`}
            />
            {i < steps.length - 1 && (
              <span className="w-px grow bg-neutral-800" />
            )}
          </div>
          <div className="min-w-0 pb-5">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className={`text-sm ${LABELS[step.state]}`}>
                {step.label}
              </span>
              {step.at && (
                <span className="font-mono text-xs text-neutral-600">
                  {formatDateTime(step.at)}
                </span>
              )}
              {step.signature && (
                <ExplorerLink value={step.signature} kind="tx" />
              )}
            </div>
            {step.detail && (
              <div
                className={`text-xs ${step.state === "failed" ? "text-red-400/80" : "text-neutral-500"}`}
              >
                {step.detail}
              </div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
