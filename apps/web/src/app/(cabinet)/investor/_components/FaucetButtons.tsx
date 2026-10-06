"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { boPost } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

/** One faucet button per test asset (GET /me/onboarding → faucetAssets). */
export type FaucetAsset = {
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  kind: string;
};

type FaucetResult = {
  ok: boolean;
  symbol: string;
  amount: number;
  signature: string;
  ata: string;
  explorerUrl: string;
};

/**
 * Devnet faucet buttons (task 603's POST /me/faucet): 100,000 major units of the asset to the
 * first verified wallet, one request per asset per hour. Real devnet mint through the qupon CLI.
 */
export function FaucetButtons({ assets }: { assets: FaucetAsset[] }) {
  const t = useTranslations("onboarding.faucet");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  const get = async (a: FaucetAsset) => {
    setBusy(a.mint);
    const res = await runWrite({
      pending: t("pending", { symbol: a.symbol }),
      success: (r: FaucetResult) => t("success", { symbol: r.symbol }),
      call: () => boPost<FaucetResult>("me/faucet", { mint: a.mint }),
      txs: (r) => [r.signature],
    });
    setBusy(null);
    if (res) router.refresh();
  };

  if (!assets.length) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {assets.map((a) => (
        <Button
          key={a.mint}
          size="sm"
          variant="secondary"
          loading={busy === a.mint}
          disabled={busy !== null}
          onClick={() => void get(a)}
        >
          {t("button", { symbol: a.symbol })}
        </Button>
      ))}
    </span>
  );
}
