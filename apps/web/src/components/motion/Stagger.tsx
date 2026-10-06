"use client";

import { type Variants, m } from "motion/react";
import {
  Children,
  createContext,
  useContext,
  isValidElement,
  type ReactNode,
} from "react";
import { DUR, EASE_OUT } from "@/lib/motion";
import { useEntrance } from "./useEntrance";

const STEP = 0.04; // delay between two items
const CAP = 12; // only the first 12 items delay one after another (task 9700)
const MAX_ROWS = 60; // no list stagger above this: long tables appear at once (task 9700)

const Animate = createContext(false);
const NoDelay = createContext(false);

/**
 * Children marked <StaggerItem> appear one after another on client-side
 * entrance. Items that pass their `index` compute their own capped delay
 * (only the first 12 grow, the rest arrive with the 12th); lists above 60
 * rows drop the stagger entirely (task 9700).
 */
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
  const items = Children.toArray(children);
  const noDelay = items.length > MAX_ROWS;
  // Indexed children carry their own delay — the parent must not stack a
  // second staggerChildren delay on top of it.
  const indexed = items.some(
    (c) => isValidElement<{ index?: number }>(c) && c.props.index !== undefined,
  );
  const C = m[as];
  return (
    <Animate.Provider value={animate}>
      <NoDelay.Provider value={noDelay}>
        <C
          className={className}
          initial={animate ? "hidden" : false}
          animate="show"
          variants={{
            show: {
              transition: indexed ? undefined : { staggerChildren: STEP },
            },
          }}
        >
          {children}
        </C>
      </NoDelay.Provider>
    </Animate.Provider>
  );
}

export function StaggerItem({
  children,
  as = "div",
  className,
  index,
}: {
  children: ReactNode;
  as?: "div" | "li" | "tr";
  className?: string;
  /** Position in the list: drives the capped entrance delay (task 9700). */
  index?: number;
}) {
  const animate = useContext(Animate);
  const noDelay = useContext(NoDelay);
  const C = m[as];
  const variants: Variants | undefined = animate
    ? {
        hidden: { opacity: 0, y: 6 },
        show: {
          opacity: 1,
          y: 0,
          transition: {
            duration: DUR.base,
            ease: EASE_OUT,
            ...(index !== undefined && !noDelay
              ? { delay: Math.min(index, CAP - 1) * STEP }
              : {}),
          },
        },
      }
    : undefined;
  return (
    <C className={className} variants={variants}>
      {children}
    </C>
  );
}
