"use client";

import { useEffect, useSyncExternalStore } from "react";
import { cx } from "@/lib/ui/cx";
import { toastStore, type Toast, type ToastKind } from "./toastStore";

const AUTO_DISMISS_MS = 6000;

const KIND_DOT: Record<ToastKind, string> = {
  success: "bg-g600",
  error: "bg-err-fg",
  info: "bg-p500",
  pending: "bg-warn-fg",
};

/** Bottom-right toast stack. Mount once (in `<Providers />`); push via `toast()`. */
export function Toaster() {
  const items = useSyncExternalStore(
    toastStore.subscribe,
    toastStore.list,
    toastStore.list,
  );
  return (
    <div
      aria-live="polite"
      className="fixed right-4 bottom-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
    >
      {items.map((t) => (
        <ToastCard key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  // success/info auto-dismiss; pending/error stay until updated or dismissed.
  useEffect(() => {
    if (t.kind !== "success" && t.kind !== "info") return;
    const timer = setTimeout(() => toastStore.dismiss(t.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [t.id, t.kind]);

  return (
    <div className="rounded-card border border-n200 bg-n0 p-4 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)]">
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden
          className={cx(
            "mt-1.5 size-2 shrink-0 rounded-full",
            KIND_DOT[t.kind],
          )}
        />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{t.title}</div>
          {t.body && <div className="mt-0.5 text-sm text-n600">{t.body}</div>}
          {t.tx && <TxLink value={t.tx} />}
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => toastStore.dismiss(t.id)}
          className="rounded-sm px-1 text-xs text-n400 hover:bg-n100 hover:text-n700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

/** Truncated devnet explorer link for a tx signature (Address parity; see Task 2). */
function TxLink({ value }: { value: string }) {
  const short =
    value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return (
    <a
      href={`https://explorer.solana.com/tx/${value}?cluster=devnet`}
      target="_blank"
      rel="noreferrer"
      title={value}
      className="num mt-1 inline-block max-w-full truncate font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
    >
      {short}
    </a>
  );
}
