"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatLike, splitNumber } from "@/lib/countUp";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useEntrance } from "./useEntrance";

/**
 * KPI numbers: count up from zero on client-side entrance, and glide from the old to the new value when polling
 * changes them — always keeping the server's formatting (separators, currency). Server HTML and first loads
 * show the final value; reduced motion never animates.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const entrance = useEntrance();
  const reduce = useReducedMotion();
  // The number currently on screen (null before the first value): a new value glides from here. Kept through
  // cleanups, so StrictMode's double effect run and mid-animation updates continue from what is displayed.
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const parts = splitNumber(value);
    const el = ref.current;
    const from = prev.current ?? (entrance ? 0 : null);
    if (reduce || !parts || !el || from === null || from === parts.n) {
      prev.current = parts?.n ?? null;
      return;
    }
    prev.current = from;
    const controls = animate(from, parts.n, {
      duration: DUR.count,
      ease: EASE_OUT,
      onUpdate: (x) => {
        prev.current = x;
        el.textContent = `${parts.prefix}${formatLike(x, parts)}${parts.suffix}`;
      },
      onComplete: () => {
        prev.current = parts.n;
        el.textContent = value;
      },
    });
    return () => {
      controls.stop();
      el.textContent = value;
    };
  }, [entrance, reduce, value]);
  return <span ref={ref}>{value}</span>;
}
