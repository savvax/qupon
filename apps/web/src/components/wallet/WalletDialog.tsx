"use client";

import { isAddress } from "@solana/kit";
import { m } from "motion/react";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { useNetwork } from "@/components/network/NetworkContext";
import { Icon } from "@/components/shell/icons";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { CATALOG, toInstall } from "@/lib/wallets";
import { cx } from "@/lib/ui/cx";
import { type WalletChoice, useWalletUX } from "./WalletUX";

function WalletIcon({ src, name }: { src?: string; name: string }) {
  return src ? (
    // biome-ignore lint/performance/noImgElement: wallet icons are data URIs from the extension itself
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className="size-9 shrink-0 rounded-[10px]" />
  ) : (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-p900 text-sm font-extrabold text-white"
    >
      {name.slice(0, 1)}
    </span>
  );
}

/** Why the wallet refused, in words a person understands. */
const ERROR_KEYS: Record<string, string> = {
  WalletConnectionError: "rejected",
  WalletWindowClosedError: "rejected",
  WalletNotReadyError: "notReady",
  WalletTimeoutError: "timeout",
};

/**
 * The wallet dialog (spec §5.7): installed wallets first, then wallets to install; with none installed it explains
 * what a Solana wallet is and offers install links, opening Qupon inside a mobile wallet, or a read-only view by
 * address. Devnet hint, EN/RU.
 */
export function WalletDialog({
  open,
  onOpenChange,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  error?: string;
}) {
  const t = useTranslations("wallet.dialog");
  const net = useNetwork();
  const { choices, connectTo, pending, setWatch } = useWalletUX();
  const installs = toInstall(choices.map((c) => c.name));
  const none = choices.length === 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={none ? t("noneTitle") : t("title")}
      description={none ? t("noneLead") : t("lead")}
    >
      <div className="space-y-5">
        {error && (
          <p
            role="alert"
            className="rounded-card bg-err-bg px-4 py-3 text-sm font-semibold text-err-fg"
          >
            {t(`errors.${ERROR_KEYS[error] ?? "generic"}`)}
          </p>
        )}

        {!none && (
          <ul className="space-y-2" aria-label={t("installed")}>
            {choices.map((c, i) => (
              <WalletRow
                key={c.name}
                choice={c}
                index={i}
                pending={pending === c.name}
                disabled={!!pending && pending !== c.name}
                onPick={() => connectTo(c.name)}
              />
            ))}
          </ul>
        )}

        {none && <WhyWallet />}

        {installs.length > 0 && (
          <section>
            <h3 className="text-xs font-bold tracking-wide text-n500 uppercase">
              {none ? t("install") : t("other")}
            </h3>
            <div className="mt-2 flex flex-wrap gap-2">
              {installs.map((w) => (
                <a
                  key={w.name}
                  href={w.install}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 rounded-card border border-n200 py-2 pr-3 pl-2 text-sm font-semibold transition hover:border-g400 hover:bg-g50"
                >
                  <WalletIcon name={w.name} />
                  <span>{w.name}</span>
                  <span
                    aria-hidden
                    className="text-n400 transition group-hover:translate-x-0.5 group-hover:text-g700"
                  >
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </section>
        )}

        {none && (
          <MobileAndWatch
            onWatch={setWatch}
            onDone={() => onOpenChange(false)}
          />
        )}

        {net.network === "devnet" && (
          <p className="flex gap-2 rounded-card bg-warn-bg px-4 py-3 text-xs text-warn-fg">
            <span aria-hidden>●</span>
            <span>{t("devnetHint")}</span>
          </p>
        )}
      </div>
    </Dialog>
  );
}

function WalletRow({
  choice,
  index,
  pending,
  disabled,
  onPick,
}: {
  choice: WalletChoice;
  index: number;
  pending: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const t = useTranslations("wallet.dialog");
  return (
    <m.li
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.2 }}
    >
      <button
        type="button"
        onClick={onPick}
        disabled={disabled || pending}
        aria-busy={pending || undefined}
        className={cx(
          "flex w-full items-center gap-3 rounded-card border border-n200 bg-n0 px-3.5 py-3 text-left transition",
          "hover:border-g400 hover:bg-g50 active:scale-[.99] disabled:opacity-60",
          pending && "border-g400 bg-g50",
        )}
      >
        <WalletIcon src={choice.icon} name={choice.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{choice.name}</span>
          <span className="block text-xs text-n500">
            {pending
              ? t("approve", { name: choice.name })
              : choice.readyState === "Loadable"
                ? t("mobile")
                : t("detected")}
          </span>
        </span>
        {pending ? (
          <span className="size-4 animate-spin rounded-full border-2 border-g600 border-t-transparent" />
        ) : (
          <span className="rounded-full bg-g50 px-2 py-0.5 text-xs font-bold text-g700">
            {t("connect")}
          </span>
        )}
      </button>
    </m.li>
  );
}

function WhyWallet() {
  const t = useTranslations("wallet.dialog");
  return (
    <div className="flex gap-3 rounded-card bg-n50 p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-p900 text-white">
        <Icon name="wallet" />
      </span>
      <ul className="space-y-1 text-sm text-n700">
        <li>{t("why.own")}</li>
        <li>{t("why.paid")}</li>
        <li>{t("why.sign")}</li>
      </ul>
    </div>
  );
}

function MobileAndWatch({
  onWatch,
  onDone,
}: {
  onWatch: (address: string) => void;
  onDone: () => void;
}) {
  const t = useTranslations("wallet.dialog");
  const [address, setAddress] = useState("");
  const [error, setError] = useState<string>();
  const here = typeof window === "undefined" ? "" : window.location.href;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const a = address.trim();
    if (!isAddress(a)) {
      setError(t("watch.invalid"));
      return;
    }
    onWatch(a);
    onDone();
  };

  return (
    <>
      <section>
        <h3 className="text-xs font-bold tracking-wide text-n500 uppercase">
          {t("mobileTitle")}
        </h3>
        <p className="mt-1 text-sm text-n600">{t("mobileLead")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATALOG.filter((w) => w.browse).map((w) => (
            <Button key={w.name} asChild variant="secondary" size="sm">
              <a href={w.browse?.(here, origin)}>
                {t("openIn", { name: w.name })}
              </a>
            </Button>
          ))}
        </div>
      </section>
      <section>
        <h3 className="text-xs font-bold tracking-wide text-n500 uppercase">
          {t("watch.title")}
        </h3>
        <form onSubmit={submit} className="mt-2 flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("watch.label")}
              placeholder="DL8G…aJEo"
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setError(undefined);
              }}
              error={error}
              hint={t("watch.hint")}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <Button type="submit" className="mt-6" disabled={!address.trim()}>
            {t("watch.go")}
          </Button>
        </form>
      </section>
    </>
  );
}
