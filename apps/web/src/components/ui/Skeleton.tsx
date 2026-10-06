import { cx } from "@/lib/ui/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      // Shimmer: a light band sweeping across (task 1108); reduced motion leaves a calm grey block.
      className={cx(
        "animate-qp-shimmer rounded-sm bg-[linear-gradient(90deg,var(--color-n100)_25%,var(--color-n50)_45%,var(--color-n100)_65%)] bg-[length:300%_100%]",
        className,
      )}
    />
  );
}
