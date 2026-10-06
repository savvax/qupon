"use client";

import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { motionState } from "@/lib/motion";

/** True when this component should animate in: mounted after the first hydration and motion is allowed. */
export function useEntrance(): boolean {
  const reduce = useReducedMotion();
  const [afterHydration] = useState(() => motionState.hydrated);
  return afterHydration && !reduce;
}
