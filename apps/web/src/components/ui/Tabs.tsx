"use client";

import { StableLabel } from "@/components/i18n/StableLabel";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { m } from "motion/react";
import { type ReactNode, useId, useState } from "react";
import { SPRING } from "@/lib/motion";

export type TabItem = { value: string; label: string; content: ReactNode };

export type TabsProps = {
  items: TabItem[];
  /** Selected tab value on first render; defaults to the first item. */
  defaultValue?: string;
};

/** Segmented tabs: list `inline-flex rounded-btn bg-n100 p-1`, active trigger lifts to `bg-n0`. */
export function Tabs({ items, defaultValue }: TabsProps) {
  const [value, setValue] = useState(defaultValue ?? items[0]?.value ?? "");
  const pill = useId(); // one sliding pill per Tabs instance
  return (
    <TabsPrimitive.Root value={value} onValueChange={setValue}>
      <TabsPrimitive.List className="inline-flex rounded-btn bg-n100 p-1">
        {items.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="relative h-8 rounded-sm px-3 text-sm font-semibold text-n600 transition-colors hover:text-n900 data-[state=active]:text-n900"
          >
            {t.value === value && (
              <m.span
                layoutId={pill}
                transition={SPRING}
                className="absolute inset-0 rounded-sm bg-n0 shadow-sm"
              />
            )}
            <span className="relative">
              <StableLabel>{t.label}</StableLabel>
            </span>
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((t) => (
        <TabsPrimitive.Content
          key={t.value}
          value={t.value}
          className="mt-4 focus-visible:outline-none data-[state=active]:animate-qp-fade-in"
        >
          {t.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
