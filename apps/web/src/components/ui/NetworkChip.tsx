"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { useNetwork } from "@/components/network/NetworkContext";
import { cx } from "@/lib/ui/cx";

const RPC: Record<string, string> = {
  devnet: "https://api.devnet.solana.com",
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
};

/**
 * "Devnet · slot 451,203,118 · updated 3 s ago". Starts from the slot the server saw (last indexed event); with
 * `live`, the browser asks the cluster for the current slot every 15 s. The age ticks every second.
 */
export function NetworkChip({
  slot: initialSlot,
  live = false,
  className,
}: {
  slot?: number;
  /** Poll the cluster RPC from the browser (off in mock mode and tests). */
  live?: boolean;
  className?: string;
}) {
  const t = useTranslations("kit.network");
  const network = useNetwork();
  const [slot, setSlot] = useState(initialSlot);
  const [at, setAt] = useState<number | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setAt(Date.now());
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 1000);
    if (!live) return () => clearInterval(tick);
    const url = RPC[network.network];
    const poll = () =>
      fetch(url!, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"jsonrpc":"2.0","id":1,"method":"getSlot","params":[{"commitment":"confirmed"}]}',
      })
        .then((r) => r.json() as Promise<{ result?: number }>)
        .then((b) => {
          if (typeof b.result === "number") {
            setSlot(b.result);
            setAt(Date.now());
          }
        })
        .catch(() => {}); // the chip is evidence, not a dependency
    void poll();
    const id = setInterval(poll, 15_000);
    return () => {
      clearInterval(tick);
      clearInterval(id);
    };
  }, [live, network.network]);

  const age = at !== null && now !== null ? Math.max(0, Math.round((now - at) / 1000)) : 0;
  const lang = useLocale() === "ru" ? "ru-RU" : "en-US";
  return (
    <span
      role="status"
      aria-label={t("label")}
      className={cx(
        "inline-flex h-7 min-w-0 items-center gap-1.5 rounded-full border border-n200 bg-n0 px-2.5 text-xs font-semibold whitespace-nowrap text-n600",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "size-1.5 shrink-0 rounded-full",
          network.mainnet ? "bg-err-fg" : "bg-g500",
          live && "qp-live",
        )}
      />
      <span className="font-bold text-n900">{t(network.network)}</span>
      {slot !== undefined && (
        <>
          <span aria-hidden className="text-n300">
            ·
          </span>
          <span className="num">
            {t("slot", { slot: slot.toLocaleString(lang) })}
          </span>
        </>
      )}
      <span aria-hidden className="text-n300 max-sm:hidden">
        ·
      </span>
      {/* fixed width: the ticking age never nudges what sits next to the chip */}
      <span className="num inline-block min-w-[13ch] max-sm:hidden">
        {age >= 60
          ? t("updatedMin", { m: Math.floor(age / 60) })
          : t("updated", { s: age })}
      </span>
    </span>
  );
}
