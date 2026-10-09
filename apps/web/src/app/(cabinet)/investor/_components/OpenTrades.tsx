"use client";

/**
 * Open secondary trades of the signed-in investor (plan 13): each row shows the terms and one button that sends
 * the investor's own leg to the trade's escrow — bonds for the seller, cash for the buyer. Demo sign-in funds
 * through the session proxy; a connected wallet signs one TransferChecked built after the on-chain record matched
 * the row shown (lib/trades.ts). The registrar settles both legs atomically.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useWallet } from "@solana/wallet-adapter-react";
import { address } from "@solana/kit";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useWalletUX } from "@/components/wallet/WalletUX";
import type { SeriesDTO } from "@/lib/api";
import { boPost } from "@/lib/boClient";
import type { SeriesRow } from "@/lib/portal";
import {
  type TradeDTO,
  type TradeSide,
  buildFundTradeIx,
  legFunded,
  listTrades,
  withTradeErrors,
} from "@/lib/trades";
import { CURRENCY_SIGN, currencyDecimals, formatAmount } from "@/lib/ui/amount";
import { useRunWrite } from "@/lib/useRunWrite";
import {
  portalRpc,
  signAndSendWithWallet,
  walletTransactionSigner,
} from "@/lib/walletSigner";
import { useWalletWrite, walletLegSent } from "../_lib/useWalletWrite";
import { useInvestor } from "./InvestorIdentity";

type Item = { series: SeriesDTO; trade: TradeDTO };
type DemoFunded = { signature?: string };

export function OpenTrades({ rows }: { rows: SeriesRow[] }) {
  const { mode, owner } = useInvestor();
  const { connect } = useWalletUX();
  const { wallet } = useWallet();
  const t = useTranslations("trades");
  const locale = useLocale() as "en" | "ru";
  const runWrite = useRunWrite();
  const runWalletWrite = useWalletWrite();
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // legs funded in this session: the API's chain reader may lag the confirmation
  const [sent, setSent] = useState<ReadonlySet<string>>(new Set());
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all(
      rows
        .filter((r) => r.me !== undefined)
        .map(async (r) => {
          // an API without the trades route (or a failed read) hides the block, never the portfolio
          const list = await listTrades(r.series.mint).catch(() => null);
          return (list?.items ?? [])
            .filter(
              (trade) =>
                trade.status !== "closed" &&
                (trade.seller === owner || trade.buyer === owner),
            )
            .map((trade) => ({ series: r.series, trade }));
        }),
    ).then((lists) => live && setItems(lists.flat()));
    return () => {
      live = false;
    };
  }, [rows, owner, nonce]);

  if (items.length === 0) return null;

  const fund = async ({ series, trade }: Item, side: TradeSide) => {
    if (mode === "watch") return connect();
    const toasts = {
      pending: t("open.pending"),
      success: () => t("open.success"),
    };
    setBusy(trade.swapDvp);
    // a pending wallet tx is not a sent leg: only a confirmed result marks it sent (task 1412)
    let sent = false;
    if (mode === "demo") {
      sent = !!(await runWrite<DemoFunded>({
        ...toasts,
        call: () =>
          withTradeErrors(
            () =>
              boPost<DemoFunded>(
                `demo/investor/series/${series.mint}/trades/${trade.swapDvp}/fund`,
                { side },
              ),
            t,
          ),
        txs: (r) => (r.signature ? [r.signature] : []),
      }));
    } else if (wallet && "signTransaction" in wallet.adapter) {
      // One signer object for fee payer and transfer authority (Kit rejects two signers with one address).
      const signer = walletTransactionSigner(wallet.adapter, address(owner));
      const ix = await buildFundTradeIx(
        portalRpc(),
        {
          swapDvp: trade.swapDvp,
          seller: trade.seller,
          buyer: trade.buyer,
          bondMint: series.mint,
          cashMint: series.cashMint,
          units: BigInt(trade.units),
          cash: BigInt(trade.cashAmount.minor),
        },
        side,
        signer,
      );
      // null = the escrow already holds the whole leg (task 1417): no tx to sign, the leg is done.
      sent = ix
        ? walletLegSent(
            await runWalletWrite({
              ...toasts,
              call: () => signAndSendWithWallet(signer, portalRpc(), [ix]),
            }),
          )
        : true;
    }
    setBusy(null);
    if (sent) {
      setSent((s) => new Set(s).add(trade.swapDvp));
      setNonce((n) => n + 1);
    }
  };

  return (
    <section aria-labelledby="open-trades">
      <h2 id="open-trades" className="mb-1 text-lg font-bold">
        {t("open.title")}
      </h2>
      <p className="mb-3 max-w-2xl text-sm text-n600">{t("open.lead")}</p>
      <div className="grid gap-3">
        {items.map((item) => {
          const { series, trade } = item;
          const side: TradeSide = trade.seller === owner ? "seller" : "buyer";
          const units = Number(trade.units);
          const cash = trade.cashAmount;
          const mine = legFunded(trade, side) || sent.has(trade.swapDvp);
          return (
            <Card
              key={trade.swapDvp}
              className="flex flex-wrap items-center justify-between gap-3"
            >
              <div className="min-w-0 text-sm">
                <span className="font-bold">{series.ticker}</span>
                {" · "}
                {t(side === "seller" ? "open.selling" : "open.buying", {
                  units,
                })}{" "}
                <Amount
                  minor={cash} // the API Amount object: display-carried decimals beat the table
                  currency={cash.currency}
                  locale={locale}
                />
                <span className="mt-1 flex items-center gap-1 text-xs text-n500">
                  {t("open.counterparty")}:
                  <Address
                    value={side === "seller" ? trade.buyer : trade.seller}
                  />
                </span>
              </div>
              {mine ? (
                <Badge tone={trade.status === "ready" ? "success" : "info"}>
                  {trade.status === "ready"
                    ? t("open.ready")
                    : `${t("open.funded")} · ${t("open.waitingOther")}`}
                </Badge>
              ) : (
                <Button
                  loading={busy === trade.swapDvp}
                  disabled={busy !== null}
                  onClick={() => void fund(item, side)}
                >
                  {mode === "watch"
                    ? t("open.connect")
                    : side === "seller"
                      ? t("open.deliver", { units })
                      : t("open.pay", {
                          amount: `${formatAmount(cash.minor, currencyDecimals(cash.currency), locale)} ${CURRENCY_SIGN[cash.currency] ?? cash.currency}`,
                        })}
                </Button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}
