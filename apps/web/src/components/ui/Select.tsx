"use client";

import * as SelectPrimitive from "@radix-ui/react-select";
import { useId } from "react";
import { cx } from "@/lib/ui/cx";

export type SelectOption = { value: string; label: string };

export type SelectProps = {
  label?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  name?: string;
};

const TRIGGER =
  "flex h-10 w-full items-center justify-between gap-2 rounded-btn border border-n300 bg-n0 px-3 text-sm data-[placeholder]:text-n500 focus:border-g600 disabled:cursor-not-allowed disabled:bg-n100 disabled:text-n400";

/** Form select on Radix primitives: keyboard-navigable, styled with design tokens. */
export function Select({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  error,
  disabled,
  name,
}: SelectProps) {
  const uid = useId();
  const id = `${uid}-select`;
  const describedBy = error ? `${uid}-err` : undefined;
  return (
    <div className="w-full">
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-[13px] font-semibold text-n700"
        >
          {label}
        </label>
      )}
      <SelectPrimitive.Root
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        name={name}
      >
        <SelectPrimitive.Trigger
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(TRIGGER, error && "border-err-bd")}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon aria-hidden>
            <svg viewBox="0 0 12 12" className="size-3.5 text-n500" fill="none">
              <path
                d="M2.5 4.5 6 8l3.5-3.5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={4}
            className="z-50 max-h-72 w-[var(--radix-select-trigger-width)] overflow-hidden rounded-card border border-n200 bg-n0 p-1 shadow-lg"
          >
            <SelectPrimitive.Viewport>
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className="flex cursor-pointer items-center justify-between gap-2 rounded-sm px-3 py-2 text-sm outline-none data-[highlighted]:bg-g50 data-[state=checked]:font-semibold"
                >
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator aria-hidden>
                    <svg
                      viewBox="0 0 12 12"
                      className="size-3.5 text-g700"
                      fill="none"
                    >
                      <path
                        d="M2 6.5 4.5 9 10 3.5"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {error && (
        <p id={describedBy} className="mt-1 text-xs text-err-fg">
          {error}
        </p>
      )}
    </div>
  );
}
