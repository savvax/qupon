// Any simulated integration (KYC, ARDFM registration, Swift delivery, fiat)
// must be labelled with this badge in the UI.
export function SimulatedBadge({ label }: { label?: string }) {
  return (
    <span
      title="Simulated integration — no real system behind this step"
      className="inline-flex items-center rounded border border-amber-800 bg-amber-950/60 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-amber-300"
    >
      SIMULATED{label ? ` · ${label}` : ""}
    </span>
  );
}
