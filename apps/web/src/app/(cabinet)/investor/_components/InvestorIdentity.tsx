"use client";

/**
 * Identity resolution for the investor cabinet (Plan 3 Task 6): a connected
 * wallet wins (self-custody, signs in the browser); else a demo-investor
 * session uses the labelled demo custodial wallet; else a chooser card.
 */

import { StableLabel, StableText } from "@/components/i18n/StableLabel";
import {
  createContext,
  type FormEvent,
  type ReactNode,
  useContext,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { isAddress } from "@solana/kit";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TextField } from "@/components/ui/TextField";
import { Icon } from "@/components/shell/icons";
import { useWalletUX } from "@/components/wallet/WalletUX";

export type InvestorIdentityValue = {
  /** wallet: connected, signs in the browser · demo: custodial demo wallet · watch: read-only by address */
  mode: "wallet" | "demo" | "watch";
  owner: string;
};

const Ctx = createContext<InvestorIdentityValue | null>(null);

/** The resolved identity — only non-null inside `<InvestorIdentity>` children. */
export function useInvestor(): InvestorIdentityValue {
  const id = useContext(Ctx);
  if (!id)
    throw new Error("useInvestor must be used inside <InvestorIdentity>");
  return id;
}

/** Card shown when there is no wallet, no read-only address and no demo session (spec §5.7). */
function Chooser({ selfRegistered = false }: { selfRegistered?: boolean }) {
  const t = useTranslations("investor.chooser");
  const w = useTranslations("wallet.button");
  const { choices, connect, pending, setWatch } = useWalletUX();
  const router = useRouter();
  const [demoPending, setDemoPending] = useState(false);
  const [error, setError] = useState<string>();
  const [watchOpen, setWatchOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [addressError, setAddressError] = useState<string>();
  const only = choices.length === 1 ? choices[0] : undefined;

  const tryDemo = async () => {
    if (demoPending) return;
    setDemoPending(true);
    setError(undefined);
    const res = await fetch("/api/session/demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "investor" }),
    }).catch(() => null);
    if (res?.ok) {
      router.refresh();
      return;
    }
    setError(t("failed"));
    setDemoPending(false);
  };

  const view = (e: FormEvent) => {
    e.preventDefault();
    if (!isAddress(address.trim())) {
      setAddressError(t("invalidAddress"));
      return;
    }
    setWatch(address.trim());
  };

  return (
    <Card className="mx-auto mt-8 max-w-xl text-center" padding="lg">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-p900 text-white shadow-[0_12px_32px_-12px_rgba(6,36,30,.7)]">
        <Icon name="wallet" className="size-7" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold tracking-tight">
        <StableText>{t("title")}</StableText>
      </h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-n600">
        <StableText>{t(selfRegistered ? "bodyAccount" : "body")}</StableText>
      </p>
      <div className="mt-6 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
        <Button size="lg" onClick={connect} loading={!!pending}>
          {only ? w("connectNamed", { name: only.name }) : t("connectWallet")}
        </Button>
        {/* a signed-in investor would lose their session to the demo one: no demo button for them */}
        {!selfRegistered && (
          <Button
            size="lg"
            variant="secondary"
            loading={demoPending}
            onClick={() => void tryDemo()}
          >
            {t("tryDemo")}
          </Button>
        )}
      </div>
      <p className="mt-3 text-xs text-n500">
        {choices.length > 1
          ? t("detectedMany", { count: choices.length })
          : only
            ? t("detectedOne", { name: only.name })
            : t("detectedNone")}
      </p>
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-err-fg">
          {error}
        </p>
      )}
      <div className="mt-6 border-t border-n100 pt-5 text-left">
        {watchOpen ? (
          <form onSubmit={view}>
            <TextField
              label={t("watchLabel")}
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setAddressError(undefined);
              }}
              error={addressError}
              hint={t("watchHint")}
              autoComplete="off"
              spellCheck={false}
              autoFocus
              action={
                <Button type="submit" disabled={!address.trim()}>
                  {t("watchGo")}
                </Button>
              }
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setWatchOpen(true)}
            className="mx-auto flex items-center gap-2 rounded-btn px-3 py-2 text-sm font-semibold text-g700 transition-colors hover:bg-g50"
          >
            <Icon name="eye" className="size-4" />
            <StableLabel>{t("watchOpen")}</StableLabel>
          </button>
        )}
      </div>
      <p className="mt-5 text-xs text-n500">
        <StableText>{t("note")}</StableText>
      </p>
    </Card>
  );
}

export function InvestorIdentity({
  title,
  demoOwner,
  selfRegistered = false,
  children,
}: {
  /** The section name (Portfolio, Placement…) — the page's h1; the wallet goes on the line below. */
  title: string;
  /** Demo custodial wallet address when the session role is investor_demo; null otherwise. */
  demoOwner: string | null;
  /** Signed in with an own investor account: the chooser offers no demo switch. */
  selfRegistered?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("investor.identity");
  const { publicKey } = useWallet();
  const { watch } = useWalletUX();
  const id: InvestorIdentityValue | null = publicKey
    ? { mode: "wallet", owner: publicKey.toBase58() }
    : demoOwner
      ? { mode: "demo", owner: demoOwner }
      : watch
        ? { mode: "watch", owner: watch }
        : null;

  if (!id) return <Chooser selfRegistered={selfRegistered} />;

  return (
    <Ctx.Provider value={id}>
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-n600">
          <StableText>
            {t(
              id.mode === "wallet"
                ? "wallet"
                : id.mode === "watch"
                  ? "watchWallet"
                  : "demoWallet",
            )}
          </StableText>
          <Address value={id.owner} />
          {id.mode === "demo" && <Badge tone="warn">{t("demoBadge")}</Badge>}
          {id.mode === "watch" && <Badge tone="warn">{t("watchBadge")}</Badge>}
        </div>
      </header>
      {children}
    </Ctx.Provider>
  );
}
