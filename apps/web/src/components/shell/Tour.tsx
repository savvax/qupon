"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { TourStep } from "@/components/ui/TourStep";
import { isTourHome, TOURS, type TourRole, tourKey } from "@/lib/tours";

/** The help menu restarts a tour with this window event (detail = the role). */
export const TOUR_RESTART = "qupon:tour-restart";

/** The first visible element named `name`; a zero-height wrapper (the NowBar docked on phones) yields its child. */
function target(name: string): HTMLElement | null {
  const el = [...document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)].find(
    (e) => e.getClientRects().length > 0,
  );
  return el && el.offsetHeight === 0 ? (el.firstElementChild as HTMLElement | null) : (el ?? null);
}

/**
 * One role's coach-mark tour: a TourStep card docked bottom-right (above the docked NowBar on phones) while the
 * element it explains gets the ring and scrolls into view. Starts by itself on the role's home page until finished
 * or skipped, resumes where it was left; progress lives in localStorage (try/catch: storage may be blocked).
 * Esc or Skip closes it for good; the help menu restarts it and moves focus to its Next button.
 */
export function Tour({ role }: { role: TourRole }) {
  const { steps } = TOURS[role];
  const t = useTranslations(`learn.tour.${role}`);
  const pathname = usePathname();
  const [step, setStep] = useState<number | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const focusCard = useRef(false);
  const key = tourKey(role);

  const save = useCallback(
    (v: string) => {
      try {
        localStorage.setItem(key, v);
      } catch {
        // storage blocked: the tour simply shows again next visit
      }
    },
    [key],
  );
  const end = useCallback(() => {
    setStep(null);
    save("done");
  }, [save]);

  // the tour belongs to the home page: it closes (unfinished, so it resumes) when the user navigates away
  useEffect(() => {
    if (!isTourHome(role, pathname)) return setStep(null);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(key);
    } catch {}
    if (saved !== "done") setStep(Math.min(Number(saved) || 0, steps.length - 1));
  }, [pathname, role, key, steps.length]);

  useEffect(() => {
    const restart = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== role) return;
      focusCard.current = true;
      setStep(0);
    };
    window.addEventListener(TOUR_RESTART, restart);
    return () => window.removeEventListener(TOUR_RESTART, restart);
  }, [role]);

  useEffect(() => {
    if (step === null) return;
    save(String(step));
    // started from the help menu: focus the card's primary button (Enter = Next)
    if (focusCard.current) [...(card.current?.querySelectorAll("button") ?? [])].at(-1)?.focus();
    focusCard.current = false;
    const el = target(steps[step]!);
    el?.setAttribute("data-tour-active", "true");
    if (el && step > 0) {
      const top = el.getBoundingClientRect().top;
      // keep the ringed element below the sticky header and clear of the docked card
      if (top < 80 || top > window.innerHeight * 0.45)
        window.scrollTo({
          top: Math.max(0, window.scrollY + top - 96),
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      el?.removeAttribute("data-tour-active");
      window.removeEventListener("keydown", onKey);
    };
  }, [step, steps, save, end]);

  if (step === null) return null;
  const name = steps[step]!;
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-52 z-40 flex justify-end md:bottom-6 md:left-auto md:right-6">
      <div ref={card} data-tour-card={role} className="pointer-events-auto w-full max-w-sm">
        <TourStep
          step={step + 1}
          total={steps.length}
          title={t(`${name}.title`)}
          onBack={() => setStep(Math.max(0, step - 1))}
          onNext={() => (step + 1 >= steps.length ? end() : setStep(step + 1))}
          onSkip={end}
        >
          {t(`${name}.body`)}
        </TourStep>
      </div>
    </div>
  );
}
