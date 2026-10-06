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
}: {
  status?: string;
  tone?: string;
  children?: ReactNode;
  dot?: boolean;
}) {
  const t = badgeTone(tone ?? status ?? "neutral");
  // Bare statuses are translated here once (status.* in messages), so no page can forget to.
  const label = useTranslations("status");
  return (
    <span
      className={cx(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold whitespace-nowrap",
        t.bg,
        t.fg,
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
