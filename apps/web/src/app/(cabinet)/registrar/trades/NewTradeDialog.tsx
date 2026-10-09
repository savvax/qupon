"use client";

import { useState } from "react";
import { type Locale } from "@/i18n/locale";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Amount } from "@/components/ui/Amount";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import type { Amount as AmountDTO } from "@/lib/api";
import { boPost } from "@/lib/boClient";
import { shortKey } from "@/lib/format";
import { withTradeErrors } from "@/lib/trades";
import { useRunWrite } from "@/lib/useRunWrite";

type CreateResponse = { signatures: string[]; swapDvp: string };

/**
 * Record a trade two active investors agreed on: seller, buyer, bonds — always at par, so the cash amount
 * (bonds × face value) is shown before anything is sent. The API creates the DvP record and admits it in one tx.
 */
export function NewTradeDialog({
  mint,
  ticker,
  face,
  investors,
}: {
  mint: string;
  ticker: string;
  face: AmountDTO;
  investors: { owner: string; units: string }[];
}) {
  const t = useTranslations("trades");
  const locale = useLocale() as Locale;
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sellerKey, setSellerKey] = useState("");
  const [buyerKey, setBuyerKey] = useState("");
  const [units, setUnits] = useState("1");

  // only a holder can sell; the buyer is any other active investor
  const sellers = investors.filter((i) => BigInt(i.units) > 0n);
  const seller = sellers.find((i) => i.owner === sellerKey) ?? sellers[0];
  const buyers = investors.filter((i) => i.owner !== seller?.owner);
  const buyer = buyers.find((i) => i.owner === buyerKey) ?? buyers[0];
  const max = seller ? BigInt(seller.units) : 0n;
  const n = /^[1-9]\d*$/.test(units) ? BigInt(units) : 0n;
  const valid =
    seller !== undefined && buyer !== undefined && n > 0n && n <= max;
  const option = (i: { owner: string; units: string }) => ({
    value: i.owner,
    label: t("new.party", { owner: shortKey(i.owner), units: Number(i.units) }),
  });

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    const res = await runWrite<CreateResponse>({
      pending: t("new.pending"),
      success: () => t("new.success"),
      call: () =>
        withTradeErrors(
          () =>
            boPost<CreateResponse>(`registrar/series/${mint}/trades`, {
              seller: seller.owner,
              buyer: buyer.owner,
              units: Number(n), // JSON has no BigInt
            }),
          t,
        ),
      txs: (r) => r.signatures ?? [],
    });
    setBusy(false);
    if (res) {
      setOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>{t("new.button")}</Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={`${t("new.title")} · ${ticker}`}
        description={t("new.lead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              {t("new.cancel")}
            </Button>
            <Button
              loading={busy}
              disabled={!valid}
              onClick={() => void submit()}
            >
              {t("new.confirm")}
            </Button>
          </>
        }
      >
        {!seller || !buyer ? (
          <p className="text-sm text-n600">{t("new.needTwo")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <Select
              label={t("new.seller")}
              value={seller.owner}
              onValueChange={setSellerKey}
              options={sellers.map(option)}
            />
            <Select
              label={t("new.buyer")}
              value={buyer.owner}
              onValueChange={setBuyerKey}
              options={buyers.map(option)}
            />
            <TextField
              label={t("new.units")}
              hint={t("new.unitsHint", { max: max.toString() })}
              error={
                units !== "" && (n === 0n || n > max)
                  ? t("new.unitsInvalid", { max: max.toString() })
                  : undefined
              }
              value={units}
              onChange={(e) => setUnits(e.target.value.trim())}
              inputMode="numeric"
            />
            <div>
              <span className="block text-xs font-semibold text-n500">
                {t("new.cashAtPar")}
              </span>
              <span className="num text-xl font-extrabold">
                {n > 0n ? (
                  <Amount
                    minor={BigInt(face.minor) * n}
                    currency={face.currency}
                    locale={locale}
                  />
                ) : (
                  "—"
                )}
              </span>
              {n > 0n && (
                <span className="ml-2 text-xs text-n500">
                  {n.toString()} ×{" "}
                  <Amount
                    minor={face.minor}
                    currency={face.currency}
                    locale={locale}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </Dialog>
    </>
  );
}
