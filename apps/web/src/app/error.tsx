"use client";

import { CrashState } from "@/components/CrashState";

/** 500 outside the public group (cabinets, api-adjacent routes). */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <CrashState error={error} reset={reset} />
    </div>
  );
}
