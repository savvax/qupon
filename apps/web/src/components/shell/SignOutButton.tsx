"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { StableLabel } from "@/components/i18n/StableLabel";
import { Button, type ButtonProps } from "@/components/ui/Button";

/** Ends the session (POST /api/session/logout) and returns to /login. */
export function SignOutButton({
  variant = "ghost",
  size = "sm",
}: Pick<ButtonProps, "variant" | "size">) {
  const t = useTranslations("common");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <Button
      aria-label={t("signOut")}
      variant={variant}
      size={size}
      loading={pending}
      onClick={async () => {
        setPending(true);
        await fetch("/api/session/logout", { method: "POST" }).catch(
          () => undefined,
        );
        router.push("/login");
        router.refresh();
      }}
    >
      {/* Phones: icon only — the top bar also holds the wallet, language and DEMO controls. */}
      <span aria-hidden className="text-base leading-none sm:hidden">
        ⏻
      </span>
      <span className="sr-only sm:not-sr-only">
        <StableLabel>{t("signOut")}</StableLabel>
      </span>
    </Button>
  );
}
