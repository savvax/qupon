"use client";

import { CrashState } from "@/components/CrashState";

/** 500 under the public shell (header/footer stay). */
export default function PublicError({
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
