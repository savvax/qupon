"use client";

// One-line explanations for the error names the API/program emit.
const EXPLANATIONS: Record<string, string> = {
  http_503: "registrar API unreachable — is `make api` running?",
  http_404: "not found — the record may not exist on devnet yet",
  WrongStatus: "the action is not in the state this step requires",
  Underfunded: "escrow balance below total net — fund the action first",
  MintPaused: "bond mint is paused (record-date window) — transfers blocked",
  MintNotPaused: "record date not struck yet — the mint must be paused first",
  TooEarly: "the clock has not reached the scheduled time yet",
  NoQuorum: "units voted stayed below the quorum threshold",
  AlreadyProcessed: "this batch was already executed — re-running is a no-op",
  EntitlementCalcMismatch:
    "recomputed entitlement math disagrees with the chain — do not pay",
};

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const code =
    "code" in error ? String((error as { code?: unknown }).code) : "error";
  const explanation =
    EXPLANATIONS[code] ?? "unexpected error — check registrar logs";
  return (
    <section className="mx-auto mt-12 max-w-xl rounded border border-red-900/60 bg-red-950/30 p-5">
      <div className="mb-1 font-mono text-sm text-red-300">{code}</div>
      <p className="mb-3 text-sm text-neutral-300">{error.message}</p>
      <p className="mb-4 text-xs text-neutral-500">{explanation}</p>
      <button
        onClick={reset}
        className="rounded border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-900"
      >
        Retry
      </button>
    </section>
  );
}
