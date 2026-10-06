"use client";
import { useTranslations } from "next-intl";
import { useCallback } from "react";
import { toast } from "@/components/ui/toastStore";
import { confirmMainnet } from "@/components/network/MainnetConfirm";
import { useNetwork } from "@/components/network/NetworkContext";
import {
  BoError,
  explainBoError,
  withNetworkConfirm,
  type ErrorText,
} from "./boClient";

export type WriteOpts<T> = {
  pending: string;
  success: (r: T) => string;
  call: () => Promise<T>;
  /** Signatures to show; the first one becomes the toast's explorer link. */
  txs?: (r: T) => string[];
  /** Also called on failure with the explained text (e.g. to keep the error visible inline). */
  onError?: (e: BoError, text: string) => void;
};

/**
 * `const runWrite = useRunWrite()` — runs a back-office write with toasts: pending → success (first tx linked)
 * or an explained error (session expiry offers a sign-in link). Resolves to null on failure.
 */
export function useRunWrite() {
  const t = useTranslations("errors");
  const network = useNetwork();
  return useCallback(
    async <T>(o: WriteOpts<T>): Promise<T | null> => {
      // Mainnet: the user types the network name first; the writes then carry the confirmation header.
      if (network.mainnet && !(await confirmMainnet())) return null;
      const id = toast({ kind: "pending", title: o.pending });
      try {
        const r = network.mainnet
          ? await withNetworkConfirm(network.network, o.call)
          : await o.call();
        toast.update(id, {
          kind: "success",
          title: o.success(r),
          tx: o.txs?.(r)[0],
        });
        return r;
      } catch (err) {
        const e =
          err instanceof BoError
            ? err
            : new BoError(0, "upstream", String(err));
        const text: ErrorText = Object.assign((k: string) => t(k), {
          has: (k: string) => t.has(k),
        });
        const explained = explainBoError(e, text);
        o.onError?.(e, explained);
        toast.update(id, {
          kind: "error",
          title: e.status === 401 ? t("sessionExpiredTitle") : t("failed"),
          body: explained,
          action:
            e.status === 401
              ? {
                  href: `/login?next=${encodeURIComponent(window.location.pathname)}`,
                  label: t("signIn"),
                }
              : undefined,
        });
        return null;
      }
    },
    [t, network],
  );
}
