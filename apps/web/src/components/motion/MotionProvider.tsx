"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { DUR, EASE_OUT, motionState } from "@/lib/motion";

/** Loads motion's DOM features lazily (~15 kB) and honours the OS reduced-motion setting everywhere. */
export function MotionProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    motionState.hydrated = true;
  }, []);
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig
        reducedMotion="user"
        transition={{ duration: DUR.base, ease: EASE_OUT }}
      >
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
