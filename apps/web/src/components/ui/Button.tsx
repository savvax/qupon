"use client";

import { Slot } from "@radix-ui/react-slot";
import {
  type ButtonHTMLAttributes,
  type ReactElement,
  type ReactNode,
  cloneElement,
  forwardRef,
  isValidElement,
} from "react";
import { stabilize } from "@/components/i18n/StableLabel";
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
    // Labels keep the width of their longer EN/RU version: switching language never moves a button (§5.8).
    if (asChild) {
      const child = isValidElement<{ children?: ReactNode }>(children)
        ? cloneElement(children as ReactElement<{ children?: ReactNode }>, {
            children: stabilize(
              (children as ReactElement<{ children?: ReactNode }>).props
                .children,
            ),
          })
        : children;
      return (
        <Slot ref={ref} className={classes} {...rest}>
          {child}
        </Slot>
      );
    }
    return (
      <button
        ref={ref}
        // Loading keeps the variant colour (unlike disabled) but blocks all activation, Enter/Space included (task 1418).
        className={cx(classes, loading && "pointer-events-none")}
        disabled={disabled || loading}
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
        {stabilize(children)}
        {!loading && iconRight}
      </button>
    );
  },
);
