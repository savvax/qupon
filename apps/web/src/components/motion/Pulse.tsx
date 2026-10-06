"use client";

import { type ReactNode, useEffect, useRef } from "react";

/**
 * A one-off green ring when `trigger` changes after mount — e.g. a status badge that polling just moved to a new
 * state. Never on first render; CSS animation, so reduced motion turns it off.
 */
export function Pulse({
  trigger,
  children,
}: {
  trigger: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const first = useRef(trigger);
  useEffect(() => {
    const el = ref.current;
    if (!el || trigger === first.current) return;
    first.current = trigger;
    el.classList.remove("animate-qp-ring");
    void el.offsetWidth; // restart the animation
    el.classList.add("animate-qp-ring");
  }, [trigger]);
  return (
    <span ref={ref} className="inline-flex rounded-full">
      {children}
    </span>
  );
}
