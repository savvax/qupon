"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Shared 500 body for error.tsx / (public)/error.tsx / global-error.tsx. */
export function CrashState({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors.crash");
  return (
    <EmptyState
      title={t("title")}
      body={
        <>
          <span>{t("body")}</span>
          {error.digest && (
            <span className="num mt-2 block text-xs text-n400">
              ref {error.digest}
            </span>
          )}
        </>
      }
      action={<Button onClick={reset}>{t("retry")}</Button>}
    />
  );
}
