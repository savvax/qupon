"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { boSend } from "@/lib/boClient";
import { cx } from "@/lib/ui/cx";
import { useRunWrite } from "@/lib/useRunWrite";

/** One cash_assets row as the Go store serialises it (task 601). */
export type AssetDTO = {
  network: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: string;
  kind: string;
  issuerNote: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  verifiedAt: number | null;
  enabled: boolean;
  createdAt: number;
};

/** Warning chips for a live authority — never silently enabled (Review Focus). */
export function AuthorityBadges({ a }: { a: AssetDTO }) {
  const t = useTranslations("assets.admin");
  if (!a.freezeAuthority && !a.mintAuthority)
    return <span className="text-xs text-n400">{t("table.none")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {a.freezeAuthority && (
        <Badge tone="warn">{t("warnings.freeze_authority")}</Badge>
      )}
      {a.mintAuthority && (
        <Badge tone="warn">{t("warnings.mint_authority")}</Badge>
      )}
    </span>
  );
}

/**
 * Enabled switch + the freeze-authority confirmation the API demands:
 * PATCHing enabled=true on a freezable mint without acceptFreezeAuthority
 * is rejected with freeze_authority_unconfirmed, so the checkbox is asked
 * for up front.
 */
export function EnabledSwitch({ a }: { a: AssetDTO }) {
  const t = useTranslations("assets.admin.toggle");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const patch = async (enabled: boolean, acceptFreeze: boolean) => {
    setBusy(true);
    const res = await runWrite({
      pending: enabled ? t("enabling") : t("disabling"),
      success: () => (enabled ? t("enabled") : t("disabled")),
      call: () =>
        boSend("PATCH", `admin/assets/${a.mint}`, {
          enabled,
          ...(acceptFreeze ? { acceptFreezeAuthority: true } : {}),
        }),
    });
    setBusy(false);
    if (res) {
      setConfirming(false);
      router.refresh();
    }
  };

  const toggle = () => {
    if (!a.enabled && a.freezeAuthority) setConfirming(true);
    else void patch(!a.enabled, false);
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={a.enabled}
        aria-label={t(a.enabled ? "on" : "off")}
        disabled={busy}
        onClick={toggle}
        className="flex h-5 w-9 items-center rounded-full border border-transparent transition-colors disabled:opacity-50"
      >
        <span
          className={cx(
            "flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
            a.enabled ? "bg-g500" : "bg-n200",
          )}
        >
          <span
            className={cx(
              "mx-0.5 size-4 rounded-full bg-n0 shadow transition-transform",
              a.enabled ? "translate-x-4" : "translate-x-0",
            )}
          />
        </span>
      </button>
      {confirming && (
        <div className="rounded-card border border-warn-bd bg-warn-bg p-3 text-xs text-warn-fg">
          <p className="font-bold">{t("confirmTitle")}</p>
          <p className="mt-1">{t("confirmBody")}</p>
          <div className="mt-2 flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              aria-label={t("cancel")}
              onClick={() => setConfirming(false)}
            >
              ✕
            </Button>
            <Button
              size="sm"
              loading={busy}
              onClick={() => void patch(true, true)}
            >
              {t("confirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
