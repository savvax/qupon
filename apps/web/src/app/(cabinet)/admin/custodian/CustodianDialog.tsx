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

/** One ledger row as GET /admin/custodian serves it (a custodian audit row). */
export type CustodianEntry = {
  id: number;
  ts: number;
  kind: string; // deposit | withdraw
  reference: string;
  amount: number; // minor units
  to?: string;
  email: string;
  ok: boolean;
  detail: string;
  signature?: string;
};

type Asset = { symbol: string; mint: string; decimals: number };

type MoveResponse = {
  ok: boolean;
  kind: string;
  reference: string;
  amount: number;
  signature: string;
  explorerUrl: string;
};

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/**
 * Record a SIMULATED CBDC movement: a deposit reference + amount → dKZT is
 * minted to an issuer treasury (asset:mint), a withdrawal burns it
 * (asset:burn). The reference travels in the transaction memo and the audit
 * ledger.
 */
export function CustodianDialog({ asset }: { asset: Asset | null }) {
  const t = useTranslations("assets.custodian.dialog");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [op, setOp] = useState<"deposit" | "withdraw">("deposit");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const [toError, setToError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOp("deposit");
    setReference("");
    setAmount("");
    setTo("");
    setToError(undefined);
  };

  const submit = async () => {
    const symbol = asset?.symbol ?? "dKZT";
    if (op === "deposit" && !BASE58.test(to.trim())) {
      setToError(t("toError"));
      return;
    }
    setBusy(true);
    const res = await runWrite<MoveResponse>({
      pending: t("pending", { kind: t(`ops.${op}`) }),
      success: () =>
        t(op === "deposit" ? "deposited" : "withdrawn", { symbol }),
      call: () =>
        boPost<MoveResponse>(`admin/custodian/${op}`, {
          reference: reference.trim(),
          amount: Number(amount),
          ...(op === "deposit" ? { to: to.trim() } : {}),
        }),
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      reset();
      router.refresh();
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("open")}</Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t("title")}
        description={t("lead", { symbol: asset?.symbol ?? "dKZT" })}
        footer={
          <>
            <Button
              variant="ghost"
              aria-label={t("close")}
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              ✕
            </Button>
            <Button
              loading={busy}
              disabled={
                !reference.trim() || !amount || (op === "deposit" && !to.trim())
              }
              onClick={() => void submit()}
            >
              {t(`submit.${op}`, { symbol: asset?.symbol ?? "dKZT" })}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Select
            label={t("op")}
            value={op}
            onValueChange={(v) => setOp(v as "deposit" | "withdraw")}
            options={[
              { value: "deposit", label: t("ops.deposit") },
              { value: "withdraw", label: t("ops.withdraw") },
            ]}
          />
          <TextField
            label={t("reference")}
            hint={t("referenceHint")}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder={t("referencePlaceholder")}
            spellCheck={false}
          />
          <TextField
            label={t("amount")}
            hint={t("amountHint", { symbol: asset?.symbol ?? "dKZT" })}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ""))}
            placeholder="250000"
            inputMode="numeric"
          />
          {op === "deposit" && (
            <TextField
              label={t("to")}
              hint={t("toHint")}
              error={toError}
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setToError(undefined);
              }}
              placeholder={t("toPlaceholder")}
              spellCheck={false}
              autoComplete="off"
            />
          )}
          <p className="text-xs text-n500">{t("simulatedNote")}</p>
        </div>
      </Dialog>
    </>
  );
}
