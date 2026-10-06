"use client";

import { useTranslations } from "next-intl";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";

/** The word a user types to confirm a mainnet write. */
export const CONFIRM_WORD = "mainnet";

type Pending = { resolve: (ok: boolean) => void } | null;
let pending: Pending = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};

/** Ask the user to type "mainnet" before a write that moves real assets; resolves false on cancel. */
export function confirmMainnet(): Promise<boolean> {
  pending?.resolve(false);
  return new Promise((resolve) => {
    pending = { resolve };
    emit();
  });
}

function settle(ok: boolean) {
  pending?.resolve(ok);
  pending = null;
  emit();
}

/** Mounted once in <Providers />: the typed-confirmation dialog behind confirmMainnet(). */
export function MainnetConfirmHost() {
  const t = useTranslations("network.confirm");
  const open = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending !== null,
    () => false,
  );
  const [typed, setTyped] = useState("");
  const close = (ok: boolean) => {
    setTyped("");
    settle(ok);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && close(false)}
      title={t("title")}
      description={t("body")}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {t("cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={typed.trim().toLowerCase() !== CONFIRM_WORD}
            onClick={() => close(true)}
          >
            {t("confirm")}
          </Button>
        </>
      }
    >
      <TextField
        label={t("label", { word: CONFIRM_WORD })}
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        autoComplete="off"
      />
    </Dialog>
  );
}
