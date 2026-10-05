"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
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
      {t("signOut")}
    </Button>
  );
}
