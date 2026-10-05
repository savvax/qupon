// Minimal stub — replaced by the full UI kit in task 050 (keep props stable).
const TONES: Record<string, string> = {
  // series / investor statuses
  Active: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Matured: "border-sky-800 bg-sky-950/60 text-sky-300",
  Retiring: "border-violet-800 bg-violet-950/60 text-violet-300",
  Closed: "border-neutral-700 bg-neutral-900 text-neutral-400",
  Suspended: "border-amber-800 bg-amber-950/60 text-amber-300",
  // action statuses
  Announced: "border-sky-800 bg-sky-950/60 text-sky-300",
  RecordStruck: "border-amber-800 bg-amber-950/60 text-amber-300",
  SnapshotComplete: "border-amber-800 bg-amber-950/60 text-amber-300",
  Funded: "border-amber-800 bg-amber-950/60 text-amber-300",
  Settling: "border-amber-800 bg-amber-950/60 text-amber-300",
  Completed: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Cancelled: "border-neutral-700 bg-neutral-900 text-neutral-400",
  VotingOpen: "border-violet-800 bg-violet-950/60 text-violet-300",
  Finalized: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  // schedule / entitlement statuses
  Projected: "border-neutral-700 bg-neutral-900 text-neutral-400",
  InProgress: "border-amber-800 bg-amber-950/60 text-amber-300",
  Paid: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
  Retired: "border-emerald-800 bg-emerald-950/60 text-emerald-300",
};

export function StatusChip({ status }: { status: string }) {
  const tone = TONES[status] ?? "border-neutral-700 bg-neutral-900 text-neutral-300";
  return (
    <span
      className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[11px] font-medium leading-4 ${tone}`}
    >
      {status}
    </span>
  );
}
