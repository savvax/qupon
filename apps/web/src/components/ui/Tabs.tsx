"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import type { ReactNode } from "react";

export type TabItem = { value: string; label: string; content: ReactNode };

export type TabsProps = {
  items: TabItem[];
  /** Selected tab value on first render; defaults to the first item. */
  defaultValue?: string;
};

/** Segmented tabs: list `inline-flex rounded-btn bg-n100 p-1`, active trigger lifts to `bg-n0`. */
export function Tabs({ items, defaultValue }: TabsProps) {
  const initial = defaultValue ?? items[0]?.value;
  return (
    <TabsPrimitive.Root defaultValue={initial}>
      <TabsPrimitive.List className="inline-flex rounded-btn bg-n100 p-1">
        {items.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className="h-8 rounded-sm px-3 text-sm font-semibold text-n600 transition-colors data-[state=active]:bg-n0 data-[state=active]:text-n900 data-[state=active]:shadow-sm"
          >
            {t.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {items.map((t) => (
        <TabsPrimitive.Content
          key={t.value}
          value={t.value}
          className="mt-4 focus-visible:outline-none"
        >
          {t.content}
        </TabsPrimitive.Content>
      ))}
    </TabsPrimitive.Root>
  );
}
