import { cx } from "@/lib/ui/cx";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cx("animate-pulse rounded-sm bg-n100", className)}
    />
  );
}
