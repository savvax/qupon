"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/lib/ui/cx";
import { TOURS, type TourRole, tourKey } from "@/lib/tours";
import { TOUR_RESTART } from "./Tour";

const ITEM = "block w-full rounded-sm px-3 py-2 text-left text-sm font-semibold text-n800 transition-colors hover:bg-n50";

/** Restart this role's tour (on its home page), /learn, the glossary: the help menu's items, also in the phone sheet. */
export function HelpItems({ role, onDone }: { role: TourRole; onDone?: () => void }) {
  const t = useTranslations("learn.help");
  const pathname = usePathname();
  const router = useRouter();
  const restart = () => {
    onDone?.();
    const { home } = TOURS[role];
    try {
      localStorage.removeItem(tourKey(role));
    } catch {}
    if (pathname === home) window.dispatchEvent(new CustomEvent(TOUR_RESTART, { detail: role }));
    else router.push(home);
  };
  return (
    <>
      <button type="button" onClick={restart} className={ITEM}>
        {t("restart")}
      </button>
      <Link href="/learn" onClick={onDone} className={ITEM}>
        {t("learn")}
      </Link>
      <Link href="/learn#glossary" onClick={onDone} className={ITEM}>
        {t("glossary")}
      </Link>
    </>
  );
}

/**
 * The "?" in the cabinet top bar and the sandbox: a plain disclosure (button + items in Tab order); Esc and an
 * outside click close it.
 */
export function HelpMenu({ role, className }: { role: TourRole; className?: string }) {
  const t = useTranslations("learn.help");
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <div ref={root} data-tour="help" className={cx("relative", className)}>
      <button
        type="button"
        aria-label={t("label")}
        aria-expanded={open}
        aria-controls={open ? "qp-help" : undefined}
        onClick={() => setOpen((v) => !v)}
        className="grid size-9 shrink-0 place-items-center rounded-btn text-n700 transition-colors hover:bg-n100 hover:text-n900"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden
          className="size-5"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M9.5 9.2a2.6 2.6 0 1 1 3.7 2.4c-.8.4-1.2 1-1.2 1.9M12 17h.01" />
        </svg>
      </button>
      {open && (
        <div
          id="qp-help"
          className="absolute right-0 z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-card border border-n200 bg-n0 p-1.5 shadow-raise"
        >
          <HelpItems role={role} onDone={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
