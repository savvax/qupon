"use client";

/**
 * Primary placement (Plan 3 Task 6 step 2): active series the investor is
 * registered in, units at par, atomic DvP subscribe — signed by the connected
 * wallet, or by the demo custodial wallet through the session proxy.
 */

import { useWalletUX } from "@/components/wallet/WalletUX";
import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TextField } from "@/components/ui/TextField";
import { boPost } from "@/lib/boClient";
import { buildSubscribeIx } from "@/lib/portal";
import { useRunWrite } from "@/lib/useRunWrite";
import {
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";
import { useInvestor } from "./InvestorIdentity";
import { useWalletWrite } from "../_lib/useWalletWrite";
import { usePortalRows } from "../_lib/usePortalRows";

/** Response of Go /demo/investor/subscribe (and the mock proxy's shape). */
type DemoWriteResult = {
  demo?: boolean;
  ok?: boolean;
  signature?: string;
  signatures?: string[];
};

const txsOf = (r: DemoWriteResult): string[] =>
  r.signature ? [r.signature] : (r.signatures ?? []);

/** The /investor/placement page body inside <InvestorIdentity>. */
export function PlacementForm() {
  const { mode, owner } = useInvestor();
  const { connect } = useWalletUX();
  const { wallet } = useWallet();
  const t = useTranslations("investor.placement");
  const locale = useLocale() as "en" | "ru";
  const runWrite = useRunWrite();
  const runWalletWrite = useWalletWrite();
  const { rows, error, reload } = usePortalRows();

  const [seriesMint, setSeriesMint] = useState("");
  const [units, setUnits] = useState("1");
  const [busy, setBusy] = useState(false);

  const registered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => r.me !== undefined && r.series.status === "Active",
      ),
    [rows],
  );
  const row =
    registered.find((r) => r.series.mint === seriesMint) ?? registered[0];
  const unitsN = Number(units);
  const total =
    row && Number.isFinite(unitsN) && unitsN >= 1
      ? BigInt(row.series.faceValue.minor) * BigInt(Math.floor(unitsN))
      : null;

  const subscribe = async (e: FormEvent) => {
    e.preventDefault();
    if (!row || busy || !Number.isFinite(unitsN) || unitsN < 1) return;
    setBusy(true);
    const n = BigInt(Math.floor(unitsN));
    const unitsLabel = n.toString();
    const ticker = row.series.ticker;
    const done = () => {
      setBusy(false);
      reload();
    };
    if (mode === "watch") {
      setBusy(false);
      connect();
      return;
    }
    if (mode === "demo") {
      const res = await runWrite({
        pending: t("toasts.subscribing", { units: unitsLabel, ticker }),
        success: () => t("toasts.subscribed", { units: unitsLabel, ticker }),
        call: () =>
          boPost<DemoWriteResult>("demo/investor/subscribe", {
            series: row.series.mint,
            units: Number(n), // JSON has no BigInt
          }),
        txs: txsOf,
      });
      done();
      void res;
      return;
    }
    if (!wallet || !("signTransaction" in wallet.adapter)) {
      setBusy(false);
      return;
    }
    // One signer object for fee payer and instruction accounts (Kit rejects two signers with one address).
    const signer = walletTransactionSigner(wallet.adapter, address(owner));
    await runWalletWrite({
      pending: t("toasts.subscribing", { units: unitsLabel, ticker }),
      success: () => t("toasts.subscribed", { units: unitsLabel, ticker }),
      call: async () => {
        const ix = await buildSubscribeIx(
          portalRpc(),
          row.series.mint,
          signer,
          n,
          BigInt(row.series.faceValue.minor),
        );
        return signAndSendWithWallet(signer, portalRpc(), [ix]);
      },
    });
    done();
  };

  if (error) return <EmptyState title={t("loadFailed")} body={error} />;
  if (!rows) return <Skeleton className="h-64" />;
  if (registered.length === 0) {
    return <EmptyState title={t("empty")} body={t("emptyBody")} />;
  }

  return (
    <Card padding="lg" className="max-w-2xl">
      <p className="text-sm text-n600">{t("lead")}</p>
      <form onSubmit={subscribe} className="mt-6 grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Select
            label={t("series")}
            value={row?.series.mint}
            onValueChange={setSeriesMint}
            options={registered.map((r) => ({
              value: r.series.mint,
              label: `${r.series.ticker} · ${r.series.isin}`,
            }))}
          />
        </div>
        <TextField
          label={t("units")}
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={units}
          onChange={(e) => setUnits(e.target.value)}
          error={
            units !== "" && (!Number.isFinite(unitsN) || unitsN < 1)
              ? t("unitsInvalid")
              : undefined
          }
        />
        <div>
          <span className="mb-1 block text-[13px] font-semibold text-n700">
            {t("pricePerUnit")}
          </span>
          <div className="flex h-10 items-center rounded-btn border border-n200 bg-n50 px-3 text-sm">
            {row && (
              <>
                <Amount
                  minor={row.series.faceValue.minor}
                  currency={row.series.faceValue.currency}
                  locale={locale}
                />
                <span className="ml-2 text-xs text-n500">{t("atPar")}</span>
              </>
            )}
          </div>
        </div>
        <div className="sm:col-span-2 flex flex-wrap items-end justify-between gap-3">
          <div>
            <span className="block text-xs font-semibold text-n500">
              {t("total")}
            </span>
            <span className="num text-xl font-extrabold">
              {total !== null && row ? (
                <Amount
                  minor={total}
                  currency={row.series.faceValue.currency}
                  locale={locale}
                />
              ) : (
                "—"
              )}
            </span>
          </div>
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={!row || !Number.isFinite(unitsN) || unitsN < 1}
          >
            {mode === "watch" ? t("connectToSign") : t("subscribe")}
          </Button>
        </div>
      </form>
      <p className="mt-4 text-xs text-n500">
        {mode === "demo"
          ? t("demoNote")
          : mode === "watch"
            ? t("watchNote")
            : t("walletNote")}
      </p>
    </Card>
  );
}
