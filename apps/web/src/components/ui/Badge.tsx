import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { badgeTone, prettifyStatus } from "@/lib/ui/badge";
import { cx } from "@/lib/ui/cx";

/** Status pill: pass an API `status` (tone + translated label derived) or an explicit `tone` with children. */
export function Badge({
  status,
  tone,
  children,
  dot = true,
  wrap = false,
  className,
}: {
  status?: string;
  tone?: string;
  children?: ReactNode;
  dot?: boolean;
  /** Let a long label wrap inside its container instead of forcing one line; the base pill classes are swapped, not appended (cx does no tailwind-merge). */
  wrap?: boolean;
  className?: string;
}) {
  const t = badgeTone(tone ?? status ?? "neutral");
  // Bare statuses are translated here once (status.* in messages), so no page can forget to.
  const label = useTranslations("status");
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 text-xs font-bold",
        // wrap swaps the one-line pill for a multi-line chip (both, never side by side — preflight #27).
        wrap
          ? "min-h-6 max-w-full py-0.5 text-left leading-snug whitespace-normal"
          : "h-6 shrink-0 whitespace-nowrap",
        t.bg,
        t.fg,
        className,
      )}
    >
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children ??
        (status
          ? label.has(status)
            ? label(status)
            : prettifyStatus(status)
          : null)}
    </span>
  );
}
