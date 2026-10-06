"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import { formatLike, splitNumber } from "@/lib/countUp";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useEntrance } from "./useEntrance";

/**
 * KPI numbers count up from zero on client-side entrance, keeping the server's formatting (separators,
 * currency). The server HTML and first loads show the final value; reduced motion never counts.
 */
export function CountUp({ value }: { value: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const run = useEntrance();
  useEffect(() => {
    const parts = splitNumber(value);
    const el = ref.current;
    if (!run || !parts || !el || parts.n === 0) return;
    const controls = animate(0, parts.n, {
      duration: DUR.count,
      ease: EASE_OUT,
      onUpdate: (x) => {
        el.textContent = `${parts.prefix}${formatLike(x, parts)}${parts.suffix}`;
      },
      onComplete: () => {
        el.textContent = value;
      },
    });
    return () => {
      controls.stop();
      el.textContent = value;
    };
  }, [run, value]);
  return <span ref={ref}>{value}</span>;
}
