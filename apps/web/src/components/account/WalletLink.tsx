"use client";

import { StableText } from "@/components/i18n/StableLabel";
import { getBase58Decoder } from "@solana/kit";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { boPost, boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";
import { useWalletUX } from "@/components/wallet/WalletUX";

export type LinkedWallet = {
  address: string;
  label: string;
  verifiedAt: number;
};

/**
 * Link the connected wallet to the account by signing a one-time server challenge (no transaction, no fee),
 * list linked wallets and unlink them (platform v2 §5.3).
 */
export function WalletLink({ wallets }: { wallets: LinkedWallet[] }) {
  const t = useTranslations("account.wallets");
  const locale = useLocale();
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { connect } = useWalletUX();
  const router = useRouter();
  const runWrite = useRunWrite();
  const [busy, setBusy] = useState(false);
  const address = publicKey?.toBase58();
  const linked = wallets.some((w) => w.address === address);

  const link = async () => {
    if (!address || !signMessage || busy) return;
    setBusy(true);
    const ok = await runWrite({
      pending: t("linking"),
      success: () => t("linked"),
      call: async () => {
        const { message } = await boPost<{ message: string }>(
          "me/wallets/challenge",
          { address },
        );
        const sig = await signMessage(new TextEncoder().encode(message));
        return boPost("me/wallets", {
          address,
          signature: getBase58Decoder().decode(sig),
        });
      },
    });
    setBusy(false);
    if (ok) router.refresh();
  };

  const unlink = async (addr: string) => {
    const ok = await runWrite({
      pending: t("unlinking"),
      success: () => t("unlinked"),
      call: () => boSend("DELETE", `me/wallets/${addr}`),
    });
    if (ok) router.refresh();
  };

  return (
    <div className="space-y-4">
      {wallets.length === 0 ? (
        <p className="text-sm text-n600">{t("none")}</p>
      ) : (
        <ul className="divide-y divide-n100 rounded-card border border-n200">
          {wallets.map((w, i) => (
            <li
              key={w.address}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <Address value={w.address} />
              {i === 0 && (
                <span className="rounded-full bg-g50 px-2 py-0.5 text-xs font-bold text-g700">
                  {t("primary")}
                </span>
              )}
              <span className="ml-auto text-xs text-n500">
                {t("verifiedAt", {
                  date: new Date(w.verifiedAt * 1000).toLocaleDateString(
                    locale,
                  ),
                })}
              </span>
              <Button
                variant="ghost"
                className="text-n600 hover:bg-err-bg hover:text-err-fg"
                size="sm"
                onClick={() => void unlink(w.address)}
              >
                {t("unlink")}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3 rounded-card bg-n50 p-4">
        {!connected || !address ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-n600">
              <StableText>{t("connectHint")}</StableText>
            </p>
            <Button onClick={connect}>{t("connect")}</Button>
          </>
        ) : linked ? (
          <>
            <p className="min-w-0 flex-1 text-sm text-n600">
              {t("alreadyLinked")} <Address value={address} />
            </p>
            <Button variant="ghost" onClick={() => void disconnect()}>
              {t("switch")}
            </Button>
          </>
        ) : (
          <>
            <p className="min-w-0 flex-1 text-sm text-n600">
              <StableText>{t("signHint")}</StableText>{" "}
              <Address value={address} />
            </p>
            <Button
              onClick={() => void link()}
              loading={busy}
              disabled={!signMessage}
            >
              {t("link")}
            </Button>
          </>
        )}
      </div>
      {connected && !signMessage && (
        <p className="text-sm text-err-fg">{t("noSignMessage")}</p>
      )}
    </div>
  );
}
