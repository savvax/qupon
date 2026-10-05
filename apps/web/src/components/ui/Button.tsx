"use client";

import { Slot } from "@radix-ui/react-slot";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import {
  buttonClasses,
  type ButtonSize,
  type ButtonVariant,
} from "@/lib/ui/button";
import { cx } from "@/lib/ui/cx";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows a spinner, disables the button and sets aria-busy. Pass the in-progress verb as children. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  /** Render the single child (e.g. a Next <Link>) with button styles. */
  asChild?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    {
      variant,
      size,
      block,
      loading = false,
      iconLeft,
      iconRight,
      asChild = false,
      className,
      children,
      disabled,
      ...rest
    },
    ref,
  ) {
    const classes = cx(buttonClasses({ variant, size, block }), className);
    if (asChild) {
      return (
        <Slot ref={ref} className={classes} {...rest}>
          {children}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        // Loading keeps the variant colour (unlike disabled) but blocks clicks.
        className={cx(classes, loading && "pointer-events-none")}
        disabled={disabled}
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        {...rest}
      >
        {loading ? (
          <span
            aria-hidden
            className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
          />
        ) : (
          iconLeft
        )}
        {children}
        {!loading && iconRight}
      </button>
    );
  },
);
