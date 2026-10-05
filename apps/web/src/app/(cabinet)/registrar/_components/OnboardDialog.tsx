"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { boPost } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type OnboardResponse = {
  investor: string;
  attestation: string;
  signatures: string[];
};

/**
 * KYC onboarding (SIMULATED provider): the SAS attests the wallet, then the
 * registrar registers the investor on-chain — two transactions.
 */
export function OnboardDialog({
  series,
}: {
  series: { mint: string; ticker: string }[];
}) {
  const t = useTranslations("registrar.investors");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mint, setMint] = useState(series[0]?.mint ?? "");
  const [wallet, setWallet] = useState("");
  const [type, setType] = useState("individual");
  const [residency, setResidency] = useState("resident");
  const [taxBps, setTaxBps] = useState("0");
  const [expiryDays, setExpiryDays] = useState("365");
  const [walletError, setWalletError] = useState<string | undefined>();

  const submit = async () => {
    if (!BASE58.test(wallet)) {
      setWalletError(t("walletError"));
      return;
    }
    const tax = Number(taxBps);
    if (!Number.isInteger(tax) || tax < 0 || tax > 10000) return;
    const expiry = Number(expiryDays);
    if (!Number.isInteger(expiry) || expiry < 0) return;
    setBusy(true);
    const res = await runWrite<OnboardResponse>({
      pending: t("onboardPending"),
      success: () => t("onboardSuccess"),
      call: () =>
        boPost<OnboardResponse>("registrar/investors", {
          series: mint,
          owner: wallet.trim(),
          investorType: type,
          residency,
          taxBps: tax,
          expiryDays: expiry,
        }),
      // attestation first, registration second — the toast links the first
      txs: (r) => r.signatures ?? [],
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      setWallet("");
      router.refresh();
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={series.length === 0}>
        {t("onboard")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t("onboardTitle")}
        description={t("onboardLead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button loading={busy} onClick={() => void submit()}>
              {t("onboard")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label={t("series")}
            value={mint}
            onValueChange={setMint}
            options={series.map((s) => ({ value: s.mint, label: s.ticker }))}
          />
          <TextField
            label={t("wallet")}
            hint={t("walletHint")}
            error={walletError}
            value={wallet}
            onChange={(e) => {
              setWallet(e.target.value);
              setWalletError(undefined);
            }}
            placeholder="e.g. 7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau"
            spellCheck={false}
            autoComplete="off"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label={t("typeLabel")}
              value={type}
              onValueChange={setType}
              options={[
                { value: "individual", label: t("types.individual") },
                { value: "legal_entity", label: t("types.legal_entity") },
              ]}
            />
            <Select
              label={t("residencyLabel")}
              value={residency}
              onValueChange={setResidency}
              options={[
                { value: "resident", label: t("residencies.resident") },
                { value: "nonresident", label: t("residencies.nonresident") },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label={t("taxLabel")}
              hint={t("taxHint")}
              value={taxBps}
              onChange={(e) => setTaxBps(e.target.value)}
              inputMode="numeric"
            />
            <TextField
              label={t("expiryLabel")}
              hint={t("expiryHint")}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
