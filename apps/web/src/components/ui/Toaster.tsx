"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/lib/ui/cx";
import { toastStore, type Toast, type ToastKind } from "./toastStore";
import { Address } from "./Address";

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

/** Kind icon: a check that draws itself (success), a spinner (pending), "!" (error), "i" (info). */
function ToastIcon({ kind }: { kind: ToastKind }) {
  if (kind === "pending")
    return (
      <span
        aria-hidden
        className="mt-0.5 size-4 shrink-0 animate-spin rounded-full border-2 border-warn-fg border-t-transparent"
      />
    );
  if (kind === "success")
    return (
      <span
        aria-hidden
        className="animate-qp-pop mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-g600"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none">
          <path
            d="M3.5 8.5 6.5 11.5 12.5 4.5"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="14"
            className="animate-qp-draw [--qp-len:14]"
          />
        </svg>
      </span>
    );
  return (
    <span
      aria-hidden
      className={cx(
        "animate-qp-pop mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-black text-white",
        KIND_DOT[kind],
      )}
    >
      {kind === "error" ? "!" : "i"}
    </span>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const tr = useTranslations("common");
  // success/info auto-dismiss; pending/error stay until updated or dismissed.
  useEffect(() => {
    if (t.kind !== "success" && t.kind !== "info") return;
    const timer = setTimeout(() => toastStore.dismiss(t.id), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [t.id, t.kind]);

  return (
    <div className="animate-qp-toast-in relative overflow-hidden rounded-card border border-n200 bg-n0 p-4 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)]">
      {/* Auto-dismiss timer: a thin bar draining over the toast's lifetime. */}
      {(t.kind === "success" || t.kind === "info") && (
        <span
          key={`${t.id}-${t.kind}`}
          aria-hidden
          className="animate-qp-timer absolute inset-x-0 bottom-0 h-0.5 origin-left bg-g400/70"
          style={{ animationDuration: `${AUTO_DISMISS_MS}ms` }}
        />
      )}
      <div className="flex items-start gap-2.5">
        <ToastIcon kind={t.kind} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold">{t.title}</div>
          {t.body && <div className="mt-0.5 text-sm text-n600">{t.body}</div>}
          {t.action && (
            <a
              href={t.action.href}
              className="mt-1 inline-block text-sm font-bold text-g700 underline-offset-2 hover:underline"
            >
              {t.action.label}
            </a>
          )}
          {t.tx && (
            <span className="mt-1 block">
              <Address value={t.tx} kind="tx" />
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={tr("dismiss")}
          onClick={() => toastStore.dismiss(t.id)}
          className="rounded-sm px-1 text-xs text-n400 hover:bg-n100 hover:text-n700"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
