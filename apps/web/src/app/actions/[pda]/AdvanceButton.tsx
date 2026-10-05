"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postAdvance } from "@/lib/api";
import { ERROR_EXPLANATIONS, findOnchainError } from "@/lib/actionFlow";
import { useToast } from "@/components/ui/Toast";

/**
 * Next-step console button: POST /actions/{pda}/advance, then optimistically
 * poll router.refresh() so the server components re-read the chain as the
 * transaction confirms. Errors render inline with the on-chain error name.
 */
export function AdvanceButton({
  pda,
  label,
  secondary = false,
}: {
  pda: string;
  label: string;
  secondary?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ name: string; message: string } | null>(null);
  const [result, setResult] = useState<{ step: string; signature?: string | null } | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(
    () => () => {
      for (const t of timers.current) clearTimeout(t);
    },
    [],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      // autofund: the console operator pressing the button is the issuer
      // approval — the Go executor only honours it on the fund step.
      const res = await postAdvance(pda, { confirm: true, autofund: true });
      setResult({ step: res.step, signature: res.signature });
      toast.push({ message: `${res.step} confirmed`, kind: "success", signature: res.signature ?? undefined });
      // Optimistic polling: devnet confirmation lands within a few seconds.
      for (let i = 1; i <= 6; i++) {
        timers.current.push(setTimeout(() => router.refresh(), i * 2500));
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const name = findOnchainError(message);
      setError({
        name: name ?? "RequestFailed",
        message: name ? ERROR_EXPLANATIONS[name] ?? message : message,
      });
      toast.push({ message: "step failed — see the panel", kind: "error" });
    } finally {
      setBusy(false);
    }
  }, [pda, router, toast]);

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className={
          secondary
            ? "rounded border border-neutral-600 px-3 py-1.5 text-sm text-neutral-300 hover:border-neutral-400 hover:text-neutral-100 disabled:opacity-50"
            : "rounded bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
        }
      >
        {busy ? "sending tx…" : label}
      </button>
      {result && (
        <div className="rounded border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200">
          <div className="font-mono">{result.step} ✓</div>
          {result.signature && (
            <a
              href={`https://explorer.solana.com/tx/${result.signature}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300"
              title={result.signature}
            >
              tx {result.signature.slice(0, 14)}… explorer ↗
            </a>
          )}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-900 bg-red-950/40 px-3 py-2 text-xs text-red-200">
          <span className="font-mono font-semibold">{error.name}</span>
          <span className="text-red-300"> — {error.message}</span>
        </div>
      )}
    </div>
  );
}
