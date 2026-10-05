"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ExplorerLink } from "./ExplorerLink";

export type ToastKind = "info" | "success" | "error";

export type ToastInput = {
  message: string;
  kind?: ToastKind;
  /** tx signature — rendered as an explorer link inside the toast */
  signature?: string;
};

type ToastItem = ToastInput & { id: number };

const ToastCtx = createContext<{ push: (t: ToastInput) => void } | null>(null);

/** `const toast = useToast()` then `toast.push({ message, signature })`. */
export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

const KINDS: Record<ToastKind, string> = {
  info: "border-sky-700",
  success: "border-emerald-700",
  error: "border-red-700",
};

const MS = 6000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const push = useCallback((t: ToastInput) => {
    const id = ++nextId.current;
    setItems((prev) => [...prev.slice(-4), { ...t, id }]); // keep at most 5
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), MS);
  }, []);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div
        aria-live="polite"
        className="fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2"
      >
        {items.map((t) => (
          <div
            key={t.id}
            className={`rounded border border-l-2 border-neutral-700 ${KINDS[t.kind ?? "info"]} bg-neutral-900 px-3 py-2 text-sm shadow-lg`}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-neutral-200">{t.message}</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setItems((prev) => prev.filter((i) => i.id !== t.id))}
                className="text-xs text-neutral-500 hover:text-neutral-200"
              >
                ✕
              </button>
            </div>
            {t.signature && (
              <div className="mt-1 text-xs">
                <ExplorerLink value={t.signature} kind="tx" />
              </div>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
