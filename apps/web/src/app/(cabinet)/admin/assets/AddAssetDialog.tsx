"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { boPost, boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";
import { Address } from "@/components/ui/Address";
import { type AssetDTO } from "./AssetRow";
import { tokenProgramName } from "./tokenProgram";

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

type AddResponse = { asset: AssetDTO; warnings: string[] };

const KINDS = ["test", "stablecoin", "wrapped_cbdc", "spl"] as const;

/**
 * "Add by mint address" (§5.1): paste an address → POST verifies it on-chain
 * and stores it disabled with the authorities as warnings → the admin fills
 * the metadata → PATCH → optional enable (freeze-authority checkbox when
 * needed). Assets are identified by mint address; tickers can be faked.
 */
export function AddAssetDialog() {
  const t = useTranslations("assets.admin");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mint, setMint] = useState("");
  const [mintError, setMintError] = useState<string | undefined>();
  const [added, setAdded] = useState<AddResponse | null>(null);
  const [symbol, setSymbol] = useState("");
  const [name, setName] = useState("");
  const [kind, setKind] = useState<string>("stablecoin");
  const [note, setNote] = useState("");
  const [enableNow, setEnableNow] = useState(false);
  const [acceptFreeze, setAcceptFreeze] = useState(false);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setMint("");
    setMintError(undefined);
    setAdded(null);
    setSymbol("");
    setName("");
    setKind("stablecoin");
    setNote("");
    setEnableNow(false);
    setAcceptFreeze(false);
  };

  const verify = async () => {
    if (!BASE58.test(mint.trim())) {
      setMintError(t("addDialog.mintError"));
      return;
    }
    setBusy(true);
    const res = await runWrite<AddResponse>({
      pending: t("addDialog.pending"),
      success: () => t("addDialog.success"),
      call: () => boPost<AddResponse>("admin/assets", { mint: mint.trim() }),
    });
    setBusy(false);
    if (res) setAdded(res);
  };

  const freezeGate =
    enableNow && !!added?.asset.freezeAuthority && !acceptFreeze;

  const save = async () => {
    if (!added) return;
    setBusy(true);
    const res = await runWrite<AddResponse>({
      pending: t("addDialog.save"),
      success: () => t("addDialog.saved"),
      call: () =>
        boSend<AddResponse>("PATCH", `admin/assets/${added.asset.mint}`, {
          symbol: symbol.trim(),
          name,
          kind,
          issuerNote: note,
          ...(enableNow
            ? {
                enabled: true,
                ...(added.asset.freezeAuthority
                  ? { acceptFreezeAuthority: true }
                  : {}),
              }
            : {}),
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
      <Button onClick={() => setOpen(true)}>{t("add")}</Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t("addDialog.title")}
        description={t("addDialog.lead")}
        footer={
          added ? (
            <>
              <Button variant="ghost" onClick={() => reset()} disabled={busy}>
                {t("addDialog.again")}
              </Button>
              <Button
                loading={busy}
                disabled={freezeGate}
                onClick={() => void save()}
              >
                {t("addDialog.save")}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={busy}
              >
                ✕
              </Button>
              <Button loading={busy} onClick={() => void verify()}>
                {t("addDialog.verify")}
              </Button>
            </>
          )
        }
      >
        {!added ? (
          <TextField
            label={t("addDialog.mint")}
            hint={t("addDialog.mintHint")}
            error={mintError}
            value={mint}
            onChange={(e) => {
              setMint(e.target.value);
              setMintError(undefined);
            }}
            placeholder="e.g. 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU"
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="rounded-card border border-n200 bg-n50 p-3 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-n500">
                {t("addDialog.verified")}
              </p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-n600">{t("addDialog.decimals")}</dt>
                <dd className="num">{added.asset.decimals}</dd>
                <dt className="text-n600">{t("addDialog.tokenProgram")}</dt>
                <dd>{tokenProgramName(added.asset.tokenProgram)}</dd>
                <dt className="text-n600">{t("addDialog.mintAuthority")}</dt>
                <dd>
                  {added.asset.mintAuthority ? (
                    <Address value={added.asset.mintAuthority} />
                  ) : (
                    t("table.none")
                  )}
                </dd>
                <dt className="text-n600">{t("addDialog.freezeAuthority")}</dt>
                <dd>
                  {added.asset.freezeAuthority ? (
                    <Address value={added.asset.freezeAuthority} />
                  ) : (
                    t("table.none")
                  )}
                </dd>
              </dl>
              {added.warnings.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {added.warnings.map((w) => (
                    <Badge key={w} tone="warn">
                      {t(`warnings.${w}`)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <TextField
              label={t("addDialog.symbol")}
              hint={t("addDialog.symbolHint")}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. KZTE-dev"
              spellCheck={false}
            />
            <TextField
              label={t("addDialog.name")}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Evo tenge (devnet stand-in)"
            />
            <Select
              label={t("addDialog.kind")}
              value={kind}
              onValueChange={setKind}
              options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
            />
            <TextField
              label={t("addDialog.note")}
              hint={t("addDialog.noteHint")}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-g600"
                checked={enableNow}
                onChange={(e) => {
                  setEnableNow(e.target.checked);
                  setAcceptFreeze(false);
                }}
              />
              {t("addDialog.enableNow")}
            </label>
            {enableNow && added.asset.freezeAuthority && (
              <label className="flex items-start gap-2 rounded-card border border-warn-bd bg-warn-bg p-3 text-xs text-warn-fg">
                <input
                  type="checkbox"
                  className="mt-0.5 size-4"
                  checked={acceptFreeze}
                  onChange={(e) => setAcceptFreeze(e.target.checked)}
                />
                {t("addDialog.acceptFreeze")}
              </label>
            )}
          </div>
        )}
      </Dialog>
    </>
  );
}
