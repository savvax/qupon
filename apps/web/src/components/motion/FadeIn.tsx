"use client";

import { m } from "motion/react";
import type { ReactNode } from "react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useEntrance } from "./useEntrance";

/** Fade + 8 px rise on client-side entrance (page transitions, panels). Static on first load. */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const animate = useEntrance();
  return (
    <m.div
      className={className}
      initial={animate ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DUR.base, ease: EASE_OUT, delay }}
    >
      {children}
    </m.div>
  );
}
