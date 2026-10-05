"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toastStore";
import { explainError } from "@/lib/walletSigner";

/**
 * Wallet-mode writes (subscribe, vote): pending toast → success with the tx
 * link, or the on-chain error explained (demo-mode writes go through
 * `useRunWrite` + the session proxy instead).
 */
export function useWalletWrite() {
  const t = useTranslations("investor.toasts");
  return useCallback(
    async (o: {
      pending: string;
      success: (sig: string) => string;
      call: () => Promise<string>;
    }): Promise<string | null> => {
      const id = toast({ kind: "pending", title: o.pending });
      try {
        const sig = await o.call();
        toast.update(id, { kind: "success", title: o.success(sig), tx: sig });
        return sig;
      } catch (e) {
        toast.update(id, {
          kind: "error",
          title: t("failed"),
          body: explainError(e),
        });
        return null;
      }
    },
    [t],
  );
}
