"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

/** Registrar API down or erroring: a calm empty state with a retry instead of the Next error overlay. */
export default function BondsError({ reset }: { reset: () => void }) {
  const t = useTranslations("bonds.unavailable");
  const router = useRouter();
  return (
    <div className="mx-auto max-w-xl px-4 py-16 sm:px-6">
      <EmptyState
        title={t("title")}
        body={t("body")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              router.refresh();
              reset();
            }}
          >
            {t("retry")}
          </Button>
        }
      />
    </div>
  );
}
