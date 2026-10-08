"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "@/components/ui/toastStore";
import { explainError, type WalletSendResult } from "@/lib/walletSigner";

/**
 * Wallet-mode writes (subscribe, vote): pending toast → success with the tx
 * link, "still pending — check the explorer" if the wait budget ran out, or
 * the on-chain error explained (demo-mode writes go through `useRunWrite` +
 * the session proxy instead). Resolves to the send result, or null on error.
 */
export function useWalletWrite() {
  const t = useTranslations("investor.toasts");
  return useCallback(
    async (o: {
      pending: string;
      success: (sig: string) => string;
      call: () => Promise<WalletSendResult>;
    }): Promise<WalletSendResult | null> => {
      const id = toast({ kind: "pending", title: o.pending });
      try {
        const { signature, pending } = await o.call();
        toast.update(
          id,
          pending
            ? { kind: "info", title: t("txPending"), tx: signature }
            : { kind: "success", title: o.success(signature), tx: signature },
        );
        return { signature, pending };
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

/**
 * A pending wallet tx is not a sent leg: only a confirmed result counts, so
 * the leg stays actionable after a refresh (task 1412).
 */
export function walletLegSent(r: WalletSendResult | null): boolean {
  return r !== null && !r.pending;
}
