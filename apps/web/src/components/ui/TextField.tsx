"use client";

import { StableText } from "@/components/i18n/StableLabel";
import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

export type TextFieldProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "className"
> & {
  label?: string;
  hint?: string;
  error?: string;
  /** Right-aligned adornment, e.g. `₸` for amount fields. */
  suffix?: ReactNode;
  /** A control on the input's row (e.g. an Import button): same line and height as the input, hint below both. */
  action?: ReactNode;
  className?: string;
};

/** Labelled input (`h-10 rounded-btn`), hint below, error in `text-err-fg` with a11y wiring. */
export function TextField({
  label,
  hint,
  error,
  suffix,
  action,
  className,
  id: idProp,
  ...input
}: TextFieldProps) {
  const uid = useId();
  const id = idProp ?? `${uid}-field`;
  const hintId = `${uid}-hint`;
  const errId = `${uid}-err`;
  const describedBy = error ? errId : hint ? hintId : undefined;
  return (
    <div className={cx("w-full", className)}>
      {label && (
        <label
          htmlFor={id}
          className="mb-1 block text-[13px] font-semibold text-n700"
        >
          {label}
        </label>
      )}
      <div className={cx(action ? "flex items-center gap-2" : undefined)}>
        <div className={cx("relative", action ? "min-w-0 flex-1" : undefined)}>
          <input
            id={id}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            className={cx(
              "h-10 w-full rounded-btn border border-n300 bg-n0 px-3 text-sm focus:border-g600",
              "disabled:cursor-not-allowed disabled:bg-n100 disabled:text-n400",
              error && "border-err-bd",
              suffix ? "pr-10" : undefined,
            )}
            {...input}
          />
          {suffix && (
            <span
              aria-hidden
              className="absolute top-1/2 right-3 -translate-y-1/2 text-sm text-n500"
            >
              {suffix}
            </span>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {hint && !error && (
        <p id={hintId} className="mt-1 text-xs text-n500">
          {/* reserves the longer locale's height: fields below never move with the language */}
          <StableText>{hint}</StableText>
        </p>
      )}
      {error && (
        <p id={errId} className="mt-1 text-xs text-err-fg">
          {error}
        </p>
      )}
    </div>
  );
}
