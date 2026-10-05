import type { ReactNode } from "react";
import { cx } from "@/lib/ui/cx";

export function Card({
  children,
  padding = "md",
  className,
}: {
  children: ReactNode;
  padding?: "md" | "lg";
  className?: string;
}) {
  return (
    <section
      className={cx(
        "rounded-card border border-n200 bg-n0",
        padding === "md" ? "p-4 sm:p-6" : "p-6 sm:p-8",
        className,
      )}
    >
      {children}
    </section>
  );
}
