"use client";

/**
 * The investor's Claim (plan 15 task 1533): `pay_batch` for one unpaid funded entitlement. A connected wallet signs
 * the same instruction the CLI's `action:claim` builds; the demo investor goes through the session proxy (the
 * server-held demo keypair signs); read-only viewing offers no button at all.
 */
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { toast } from "@/components/ui/toastStore";
import { boPost } from "@/lib/boClient";
import {
  buildClaimIx,
  claimableEntitlements,
  type SeriesRow,
} from "@/lib/portal";
import {
  explainError,
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";

/** What the registrar answers for /demo/investor/claim (openapi DemoResponse). */
type DemoClaimResponse = { demo: boolean; ok: boolean; signature: string };

/** One claimable payout: the series it belongs to and the funded action holding the entitlement. */
export type ClaimTarget = { mint: string; actionPda: string };

/**
 * Run claims for the signed-in identity: `claim` sends one entitlement's payout, `claimAll` sweeps every claimable
 * entitlement sequentially (pay_batch pays one holder per instruction). Each attempt toasts its own result —
 * failures never abort the sweep. Resolves when everything finished; `claiming` covers the whole run.
 */
export function useClaims(
  rows: SeriesRow[],
  reload: () => void,
  mode: "wallet" | "demo" | "watch",
): {
  claim: (t: ClaimTarget) => Promise<boolean>;
  claimAll: () => Promise<void>;
  claiming: boolean;
} {
  const t = useTranslations("investor.toasts");
  const { wallet, publicKey } = useWallet();
  const [claiming, setClaiming] = useState(false);

  const runOne = useCallback(
    async (target: ClaimTarget): Promise<boolean> => {
      const id = toast({ kind: "pending", title: t("claimPending") });
      try {
        let signature: string;
        if (mode === "wallet") {
          if (!publicKey || !wallet || !("signTransaction" in wallet.adapter))
            throw new Error("connect a wallet that can sign transactions");
          const signer = walletTransactionSigner(
            wallet.adapter,
            address(publicKey.toBase58()),
          );
          const instructions = await buildClaimIx(
            portalRpc(),
            target.mint,
            address(target.actionPda),
            signer,
          );
          const res = await signAndSendWithWallet(
            signer,
            portalRpc(),
            instructions,
          );
          signature = res.signature;
        } else {
          const res = await boPost<DemoClaimResponse>("demo/investor/claim", {
            action: target.actionPda,
            owner: publicKey?.toBase58(),
          });
          signature = res.signature;
        }
        toast.update(id, {
          kind: "success",
          title: t("claimDone"),
          tx: signature,
        });
        return true;
      } catch (e) {
        toast.update(id, {
          kind: "error",
          title: t("failed"),
          body: explainError(e),
        });
        return false;
      }
    },
    [mode, publicKey, t, wallet],
  );

  const claimAll = useCallback(async () => {
    if (claiming) return;
    setClaiming(true);
    try {
      for (const c of claimableEntitlements(rows))
        await runOne({ mint: c.row.series.mint, actionPda: c.action.pda });
      reload();
    } finally {
      setClaiming(false);
    }
  }, [claiming, reload, rows, runOne]);

  const claim = useCallback(
    async (target: ClaimTarget) => {
      if (claiming) return false;
      setClaiming(true);
      try {
        const ok = await runOne(target);
        if (ok) reload();
        return ok;
      } finally {
        setClaiming(false);
      }
    },
    [claiming, reload, runOne],
  );

  return { claim, claimAll, claiming };
}
