"use client";

import { type Variants, m } from "motion/react";
import { type ReactNode, createContext, useContext } from "react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useEntrance } from "./useEntrance";

const item: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: DUR.base, ease: EASE_OUT },
  },
};

const Animate = createContext(false);

/** Children marked <StaggerItem> appear one after another (40 ms apart) on client-side entrance. */
export function Stagger({
  children,
  as = "div",
  className,
}: {
  children: ReactNode;
  as?: "div" | "ul" | "ol" | "tbody";
  className?: string;
}) {
  const animate = useEntrance();
  const C = m[as];
  return (
    <Animate.Provider value={animate}>
      <C
        className={className}
        initial={animate ? "hidden" : false}
        animate="show"
        variants={{ show: { transition: { staggerChildren: 0.04 } } }}
      >
        {children}
      </C>
    </Animate.Provider>
  );
}

export function StaggerItem({
  children,
  as = "div",
  className,
}: {
  children: ReactNode;
  as?: "div" | "li" | "tr";
  className?: string;
}) {
  const C = m[as];
  return (
    <C className={className} variants={useContext(Animate) ? item : undefined}>
      {children}
    </C>
  );
}
