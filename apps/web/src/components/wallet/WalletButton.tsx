"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, m } from "motion/react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { explorerHref, useNetwork } from "@/components/network/NetworkContext";
import { StableLabel } from "@/components/i18n/StableLabel";
import { Icon } from "@/components/shell/icons";
import { cx } from "@/lib/ui/cx";
import { shortAddress } from "@/lib/wallets";
import { useWalletUX } from "./WalletUX";

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-btn px-3 py-2 text-left text-sm font-semibold text-n800 transition hover:bg-n100";

/**
 * Header / top-bar wallet control (spec §5.7). Disconnected: "Connect wallet" — or "Connect Phantom" when exactly
 * one wallet is installed. Connected (or viewing by address): a chip with the short address and a menu.
 */
export function WalletButton({
  compact = false,
  labelAt = "sm",
}: {
  /** Icon-only below `labelAt` (the public header has less room than the cabinet top bar). */
  compact?: boolean;
  labelAt?: "sm" | "xl";
}) {
  const t = useTranslations("wallet.button");
  const net = useNetwork();
  const { publicKey, wallet, disconnect, connecting } = useWallet();
  const { choices, connect, pending, watch, setWatch } = useWalletUX();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent
          ? e.key === "Escape"
          : !ref.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const address = publicKey?.toBase58() ?? watch;
  const busy = connecting || !!pending;

  if (!address) {
    const only = choices.length === 1 ? choices[0] : undefined;
    const label = only ? t("connectNamed", { name: only.name }) : t("connect");
    return (
      <button
        type="button"
        onClick={connect}
        disabled={busy}
        aria-label={compact ? label : undefined}
        className={cx(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-btn bg-p900 px-3 text-sm font-bold whitespace-nowrap text-white shadow-sm transition",
          "hover:bg-p800 active:scale-[.98] disabled:opacity-70",
        )}
      >
        {busy ? (
          <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : only?.icon ? (
          // biome-ignore lint/performance/noImgElement: data-URI icon from the wallet extension
          // eslint-disable-next-line @next/next/no-img-element
          <img src={only.icon} alt="" className="size-5 rounded" />
        ) : (
          <Icon name="wallet" className="size-4" />
        )}
        <span
          className={cx(
            compact &&
              (labelAt === "xl"
                ? "sr-only xl:not-sr-only"
                : "sr-only sm:not-sr-only"),
          )}
        >
          <StableLabel
            template={only ? t.raw("connectNamed") : undefined}
            values={only ? { name: only.name } : undefined}
          >
            {label}
          </StableLabel>
        </span>
      </button>
    );
  }

  const copy = async () => {
    await navigator.clipboard?.writeText(address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={shortAddress(address)}
        className={cx(
          "inline-flex h-9 shrink-0 items-center gap-2 rounded-btn border px-2.5 text-sm font-bold whitespace-nowrap transition active:scale-[.98]",
          watch && !publicKey
            ? "border-warn-fg/30 bg-warn-bg text-warn-fg"
            : "border-g200 bg-g50 text-g800 hover:bg-g100",
        )}
      >
        {wallet?.adapter.icon && publicKey ? (
          // biome-ignore lint/performance/noImgElement: data-URI icon from the wallet extension
          // eslint-disable-next-line @next/next/no-img-element
          <img src={wallet.adapter.icon} alt="" className="size-5 rounded" />
        ) : (
          <Icon name={publicKey ? "wallet" : "eye"} className="size-4" />
        )}
        <span className={cx("num", compact && "hidden sm:inline")}>
          {shortAddress(address)}
        </span>
        <span
          aria-hidden
          className={cx("text-xs transition", open && "rotate-180")}
        >
          ▾
        </span>
      </button>
      <AnimatePresence>
        {open && (
          <m.div
            role="menu"
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 z-50 mt-2 w-72 origin-top-right rounded-card border border-n200 bg-n0 p-2 shadow-[0_24px_64px_-24px_rgba(18,26,22,.45)]"
          >
            <div className="px-3 py-2">
              <div className="text-xs font-semibold text-n500">
                {publicKey
                  ? t("connectedWith", { name: wallet?.adapter.name ?? "" })
                  : t("viewing")}
              </div>
              <div className="num mt-1 text-xs break-all text-n800">
                {address}
              </div>
            </div>
            <div className="my-1 h-px bg-n100" />
            <button
              type="button"
              role="menuitem"
              className={MENU_ITEM}
              onClick={() => void copy()}
            >
              <span aria-hidden className="w-4 text-center">
                {copied ? "✓" : "⧉"}
              </span>
              {copied ? t("copied") : t("copy")}
            </button>
            <a
              role="menuitem"
              className={MENU_ITEM}
              href={explorerHref("address", address, net.explorerCluster)}
              target="_blank"
              rel="noreferrer"
            >
              <span aria-hidden className="w-4 text-center">
                ↗
              </span>
              {t("explorer")}
            </a>
            {publicKey ? (
              <>
                <Link
                  role="menuitem"
                  className={MENU_ITEM}
                  href="/account"
                  onClick={() => setOpen(false)}
                >
                  <span aria-hidden className="w-4 text-center">
                    ⚭
                  </span>
                  {t("link")}
                </Link>
                <button
                  type="button"
                  role="menuitem"
                  className={cx(MENU_ITEM, "text-err-fg hover:bg-err-bg")}
                  onClick={() => {
                    setOpen(false);
                    void disconnect();
                  }}
                >
                  <span aria-hidden className="w-4 text-center">
                    ⏻
                  </span>
                  {t("disconnect")}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  className={MENU_ITEM}
                  onClick={() => {
                    setOpen(false);
                    connect();
                  }}
                >
                  <span aria-hidden className="w-4 text-center">
                    ⚡
                  </span>
                  {t("connect")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={cx(MENU_ITEM, "text-err-fg hover:bg-err-bg")}
                  onClick={() => {
                    setOpen(false);
                    setWatch(null);
                  }}
                >
                  <span aria-hidden className="w-4 text-center">
                    ✕
                  </span>
                  {t("stopViewing")}
                </button>
              </>
            )}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
