"use client";

/**
 * Identity resolution for the investor cabinet (Plan 3 Task 6): a connected
 * wallet wins (self-custody, signs in the browser); else a demo-investor
 * session uses the labelled demo custodial wallet; else a chooser card.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export type InvestorIdentityValue = {
  mode: "wallet" | "demo";
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

/** Card shown when neither a wallet nor a demo session is present. */
function Chooser() {
  const t = useTranslations("investor.chooser");
  const { setVisible } = useWalletModal();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();

  const tryDemo = async () => {
    if (pending) return;
    setPending(true);
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
    setPending(false);
  };

  return (
    <Card className="mx-auto mt-8 max-w-xl text-center" padding="lg">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mx-auto mt-2 max-w-md text-sm text-n600">{t("body")}</p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" onClick={() => setVisible(true)}>
          {t("connectWallet")}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          loading={pending}
          onClick={() => void tryDemo()}
        >
          {t("tryDemo")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="mt-4 text-sm font-semibold text-err-fg">
          {error}
        </p>
      )}
      <p className="mt-5 text-xs text-n500">{t("note")}</p>
    </Card>
  );
}

export function InvestorIdentity({
  demoOwner,
  children,
}: {
  /** Demo custodial wallet address when the session role is investor_demo; null otherwise. */
  demoOwner: string | null;
  children: ReactNode;
}) {
  const t = useTranslations("investor.identity");
  const { publicKey } = useWallet();
  const id: InvestorIdentityValue | null = publicKey
    ? { mode: "wallet", owner: publicKey.toBase58() }
    : demoOwner
      ? { mode: "demo", owner: demoOwner }
      : null;

  if (!id) return <Chooser />;

  return (
    <Ctx.Provider value={id}>
      <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight">
          {t(id.mode === "wallet" ? "wallet" : "demoWallet")}
        </h1>
        {id.mode === "demo" && <Badge tone="warn">{t("demoBadge")}</Badge>}
        <span className="text-sm text-n600">
          <Address value={id.owner} />
        </span>
      </div>
      {children}
    </Ctx.Provider>
  );
}
