/**
 * Status chip for every status the registrar API emits: series (Active,
 * Matured, Retiring, Closed), investor (Active, Suspended), the ten action
 * statuses (Announced … Finalized), entitlement (Snapshotted, Paid, Retired),
 * schedule (Projected, Announced, InProgress, Completed) and vote values.
 * Unknown statuses render neutral so new API values never break the UI.
 */
const TONES: Record<string, string> = {
  // series / investor
  Active: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Matured: "border-sky-800 bg-sky-950/60 text-sky-300",
  Retiring: "border-violet-800 bg-violet-950/60 text-violet-300",
  Closed: "border-neutral-700 bg-neutral-900 text-neutral-400",
  Suspended: "border-amber-800 bg-amber-950/60 text-amber-300",
  // action lifecycle (10)
  Announced: "border-sky-800 bg-sky-950/60 text-sky-300",
  RecordStruck: "border-amber-800 bg-amber-950/60 text-amber-300",
  SnapshotComplete: "border-amber-800 bg-amber-950/60 text-amber-300",
  Funded: "border-amber-800 bg-amber-950/60 text-amber-300",
  Settling: "border-amber-800 bg-amber-950/60 text-amber-300",
  Completed: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Cancelled: "border-neutral-700 bg-neutral-900 text-neutral-400",
  VotingOpen: "border-violet-800 bg-violet-950/60 text-violet-300",
  Finalized: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  // entitlement / schedule
  Snapshotted: "border-amber-800 bg-amber-950/60 text-amber-300",
  InProgress: "border-amber-800 bg-amber-950/60 text-amber-300",
  Paid: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Retired: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Projected: "border-neutral-700 bg-neutral-900 text-neutral-400",
  // votes
  For: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Against: "border-red-800 bg-red-950/60 text-red-300",
  Abstain: "border-neutral-700 bg-neutral-900 text-neutral-400",
};

/** "RecordStruck" → "Record Struck"; single words pass through. */
function prettify(status: string): string {
  return status.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function StatusChip({ status }: { status: string }) {
  const tone = TONES[status] ?? "border-neutral-700 bg-neutral-900 text-neutral-300";
  return (
    <span
      title={status}
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap ${tone}`}
    >
      {prettify(status)}
    </span>
  );
}
