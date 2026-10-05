// Minimal stub — replaced by the full UI kit in task 050 (keep props stable).
import { ExplorerLink } from "./ExplorerLink";

export type TimelineStep = {
  label: string;
  state: "done" | "current" | "pending" | "failed";
  detail?: string;
  /** tx signature of the step, when it executed on-chain */
  signature?: string | null;
};

const DOTS: Record<TimelineStep["state"], string> = {
  done: "border-emerald-500 bg-emerald-500",
  current: "border-amber-400 bg-neutral-950",
  pending: "border-neutral-700 bg-neutral-950",
  failed: "border-red-500 bg-red-500",
};

export function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="space-y-0">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`mt-1 h-2.5 w-2.5 rounded-full border ${DOTS[step.state]}`} />
            {i < steps.length - 1 && <span className="w-px grow bg-neutral-800" />}
          </div>
          <div className="pb-5">
            <div className="flex items-baseline gap-2">
              <span
                className={`text-sm ${step.state === "pending" ? "text-neutral-500" : "text-neutral-200"}`}
              >
                {step.label}
              </span>
              {step.signature && <ExplorerLink value={step.signature} kind="tx" />}
            </div>
            {step.detail && (
              <div className="text-xs text-neutral-500">{step.detail}</div>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}
