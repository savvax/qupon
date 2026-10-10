"use client";

/**
 * Payout route card (plan 15 D6, task 1533): the holder chooses where payouts go — their wallet's cash account, or a
 * bank account (the transfer itself is SIMULATED; only the paying agent confirms it). The IBAN-like reference is
 * hashed in the browser with WebCrypto; only the sha256 leaves it — on-chain and in the API request the registrar
 * proxies. Change is signed by the wallet (`set_payout_route`); the demo/read-only views show the current route.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { TextField } from "@/components/ui/TextField";
import { toast } from "@/components/ui/toastStore";
import { type HolderPosition } from "@/lib/holder";
import { buildSetPayoutRouteIx, sha256Bytes } from "@/lib/portal";
import {
  explainError,
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";

/** Current on-chain route, or null when no PayoutRoute account exists (payouts go to the cash account). */
export function PayoutRouteCard({
  position,
  mode,
}: {
  position: HolderPosition;
  /** wallet signs the change; demo/watch read the route only */
  mode: "wallet" | "demo" | "watch";
}) {
  const t = useTranslations("investor.route");
  const ta = useTranslations("investor.toasts");
  const { wallet, publicKey } = useWallet();
  const [route, setRoute] = useState<"wallet" | "bank">(
    position.payoutRoute?.route === "bank" ? "bank" : "wallet",
  );
  const [bankRef, setBankRef] = useState("");
  const [busy, setBusy] = useState(false);
  const current = position.payoutRoute;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const hash =
        route === "bank"
          ? await sha256Bytes(bankRef.trim())
          : new Uint8Array(32);
      if (mode === "wallet") {
        if (!publicKey || !wallet || !("signTransaction" in wallet.adapter))
          throw new Error("connect a wallet that can sign transactions");
        const signer = walletTransactionSigner(
          wallet.adapter,
          address(publicKey.toBase58()),
        );
        const ix = await buildSetPayoutRouteIx(
          position.mint,
          signer,
          route,
          hash,
        );
        const res = await signAndSendWithWallet(signer, portalRpc(), [ix]);
        toast({ kind: "success", title: ta("routeDone"), tx: res.signature });
      } else {
        // demo/watch are read-only (the Save button is hidden there); this guard stays for safety
        throw new Error(t("bankWalletOnly"));
      }
    } catch (e) {
      toast({ kind: "error", title: ta("failed"), body: explainError(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-card border border-n200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-n500">{t("title")}</span>
        {route === "bank" && (
          <ProvenanceChip kind="simulated">{t("bankSimulated")}</ProvenanceChip>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={`route-${position.mint}`}
            checked={route === "wallet"}
            onChange={() => setRoute("wallet")}
          />
          {t("wallet")}
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 text-sm">
          <input
            type="radio"
            name={`route-${position.mint}`}
            checked={route === "bank"}
            onChange={() => setRoute("bank")}
          />
          {t("bank")}
        </label>
      </div>
      {route === "bank" && (
        <div className="mt-2">
          <TextField
            label={t("bankRef")}
            value={bankRef}
            onChange={(e) => setBankRef(e.target.value)}
            hint={t("bankRefHint")}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-xs text-n500">
          {current
            ? t("current", {
                route: t(current.route),
                hash: shortHash(current.bankRefHash),
              })
            : t("currentDefault")}
        </span>
        {mode === "wallet" ? (
          <Button
            size="sm"
            loading={busy}
            disabled={route === "bank" && bankRef.trim().length < 4}
            onClick={() => void save()}
          >
            {t("save")}
          </Button>
        ) : (
          <Badge tone="neutral">
            {mode === "demo" ? t("demoReadonly") : t("watchReadonly")}
          </Badge>
        )}
      </div>
    </div>
  );
}

function shortHash(hash: string | null | undefined): string {
  return hash ? `${hash.slice(0, 6)}…` : "—";
}
