import { cx } from "./cx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "primaryOnDark"
  | "secondaryOnDark";
export type ButtonSize = "sm" | "md" | "lg";

// Motion v3 (§5.8): press = quick scale-down, hover = 1 px lift with a deeper shadow (primary); 150 ms ease-out.
// `whitespace-nowrap` lives in the !wrap branch, not BASE: a wrapping button swaps it below (cx cannot override it).
const BASE =
  "inline-flex items-center justify-center gap-2 font-semibold border transition-[background,border-color,box-shadow,transform,color,filter] duration-150 ease-[cubic-bezier(.2,.8,.2,1)] active:scale-[.97] active:duration-75 disabled:cursor-not-allowed disabled:bg-n100 disabled:text-n400 disabled:border-n200 disabled:shadow-none disabled:scale-100 disabled:translate-y-0";

const HEIGHT: Record<ButtonSize, string> = {
  sm: "h-8",
  md: "h-10",
  lg: "h-12",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 text-[13px] rounded-sm gap-1.5 [&_svg]:size-3.5",
  md: "px-4 text-sm rounded-btn [&_svg]:size-4",
  lg: "px-5 text-[15px] rounded-[12px] [&_svg]:size-4",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-g600 text-white border-g700 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(4,67,26,.24)] hover:-translate-y-px hover:bg-g700 hover:border-g800 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_8px_20px_-8px_rgba(4,67,26,.55)] active:translate-y-0 active:bg-g800",
  secondary:
    "bg-n0 text-n900 border-n300 shadow-[0_1px_2px_rgba(18,26,22,.05)] hover:-translate-y-px hover:bg-n50 hover:border-n400 hover:shadow-[0_6px_16px_-8px_rgba(18,26,22,.25)] active:translate-y-0 active:bg-n100",
  ghost:
    "bg-transparent text-g700 border-transparent hover:bg-g50 active:bg-g100",
  destructive: "bg-n0 text-err-fg border-err-bd hover:bg-err-bg",
  primaryOnDark:
    "bg-accent-dark text-[#04210f] border-[#22a64f] shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_6px_16px_-6px_rgba(46,192,95,.55)] hover:-translate-y-px hover:brightness-105 hover:shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_12px_28px_-8px_rgba(46,192,95,.7)] active:translate-y-0",
  secondaryOnDark:
    "bg-white/8 text-[#eaf6f1] border-white/20 hover:bg-white/12",
};

/** Class list for a design-system button (also used to style links as buttons). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
  wrap = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Multi-line label that wraps inside its container instead of forcing one line (e.g. long kk trigger, preflight #3). */
  wrap?: boolean;
}): string {
  return cx(
    BASE,
    // wrap swaps the fixed height AND the nowrap for h-auto + normal wrapping (both, never side by side).
    wrap
      ? "h-auto max-w-full py-2 text-left leading-snug whitespace-normal"
      : cx(HEIGHT[size], "whitespace-nowrap"),
    SIZE[size],
    VARIANT[variant],
    block && "w-full",
  );
}
