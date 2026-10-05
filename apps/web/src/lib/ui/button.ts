import { cx } from "./cx";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "destructive"
  | "primaryOnDark"
  | "secondaryOnDark";
export type ButtonSize = "sm" | "md" | "lg";

const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold border transition-[background,border-color,box-shadow,transform] duration-100 active:translate-y-px disabled:cursor-not-allowed disabled:bg-n100 disabled:text-n400 disabled:border-n200 disabled:shadow-none disabled:translate-y-0";

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[13px] rounded-sm gap-1.5 [&_svg]:size-3.5",
  md: "h-10 px-4 text-sm rounded-btn [&_svg]:size-4",
  lg: "h-12 px-5 text-[15px] rounded-[12px] [&_svg]:size-4",
};

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-g600 text-white border-g700 shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_1px_2px_rgba(4,67,26,.24)] hover:bg-g700 hover:border-g800 active:bg-g800",
  secondary:
    "bg-n0 text-n900 border-n300 shadow-[0_1px_2px_rgba(18,26,22,.05)] hover:bg-n50 hover:border-n400 active:bg-n100",
  ghost:
    "bg-transparent text-g700 border-transparent hover:bg-g50 active:bg-g100",
  destructive: "bg-n0 text-err-fg border-err-bd hover:bg-err-bg",
  primaryOnDark:
    "bg-accent-dark text-[#04210f] border-[#22a64f] shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_6px_16px_-6px_rgba(46,192,95,.55)] hover:brightness-105",
  secondaryOnDark:
    "bg-white/8 text-[#eaf6f1] border-white/20 hover:bg-white/12",
};

/** Class list for a design-system button (also used to style links as buttons). */
export function buttonClasses({
  variant = "primary",
  size = "md",
  block = false,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}): string {
  return cx(BASE, SIZE[size], VARIANT[variant], block && "w-full");
}
