"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { boPost } from "@/lib/boClient";
import { type TradeSide, withTradeErrors } from "@/lib/trades";
import { useRunWrite } from "@/lib/useRunWrite";

type Signed = { signatures: string[] };
type Cancelled = Signed & { returnedUnits: string };
type DemoFunded = { signature?: string };

/**
 * Row writes of an open trade: Settle (both legs funded), Cancel, Return bonds to seller (the forced cancel, behind a
 * confirm dialog) and, on devnet, demo funding of the legs still missing. Every success toast links its transaction.
 */
export function TradeRowActions({
  mint,
  swapDvp,
  ready,
  demoSides,
}: {
  mint: string;
  swapDvp: string;
  ready: boolean;
  /** legs the demo funding route may still fund; empty hides the button */
  demoSides: TradeSide[];
}) {
  const t = useTranslations("trades");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "force" | null>(null);
  const base = `registrar/series/${mint}/trades/${swapDvp}`;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    const ok = await work();
    setBusy(false);
    if (ok) setConfirm(null);
    router.refresh();
  };

  const settle = () =>
    run(() =>
      runWrite<Signed>({
        pending: t("row.settlePending"),
        success: () => t("row.settleSuccess"),
        call: () => withTradeErrors(() => boPost<Signed>(`${base}/settle`), t),
        txs: (r) => r.signatures ?? [],
      }),
    );

  const cancel = (force: boolean) =>
    run(() =>
      runWrite<Cancelled>({
        pending: t(force ? "row.forcePending" : "row.cancelPending"),
        success: (r) =>
          force
            ? t("row.forceSuccess", { units: r.returnedUnits ?? "0" })
            : t("row.cancelSuccess"),
        call: () =>
          withTradeErrors(
            () => boPost<Cancelled>(`${base}/cancel`, { force }),
            t,
          ),
        txs: (r) => r.signatures ?? [],
      }),
    );

  // one write (and one toast with its tx link) per leg; stops at the first refusal
  const fundDemo = () =>
    run(async () => {
      for (const side of demoSides) {
        const res = await runWrite<DemoFunded>({
          pending: t("row.fundPending", { side }),
          success: () => t("row.fundSuccess", { side }),
          call: () =>
            withTradeErrors(
              () =>
                boPost<DemoFunded>(
                  `demo/investor/series/${mint}/trades/${swapDvp}/fund`,
                  { side },
                ),
              t,
            ),
          txs: (r) => (r.signature ? [r.signature] : []),
        });
        if (!res) return false;
      }
      return true;
    });

  return (
    <div className="ml-auto flex w-max max-w-[19rem] flex-wrap justify-end gap-2">
      {demoSides.length > 0 && (
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onClick={() => void fundDemo()}
        >
          {t("row.fundDemo")}
        </Button>
      )}
      <Button
        size="sm"
        disabled={!ready || busy}
        title={ready ? undefined : t("row.settleHint")}
        onClick={() => void settle()}
      >
        {t("row.settle")}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        disabled={busy}
        onClick={() => setConfirm("cancel")}
      >
        {t("row.cancel")}
      </Button>
      <Button
        size="sm"
        variant="destructive"
        disabled={busy}
        onClick={() => setConfirm("force")}
      >
        {t("row.force")}
      </Button>
      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => !busy && !open && setConfirm(null)}
        title={t(
          confirm === "force"
            ? "row.confirmForceTitle"
            : "row.confirmCancelTitle",
        )}
        description={t(
          confirm === "force"
            ? "row.confirmForceBody"
            : "row.confirmCancelBody",
        )}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirm(null)}
              disabled={busy}
            >
              {t("row.keep")}
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              onClick={() => void cancel(confirm === "force")}
            >
              {t(confirm === "force" ? "row.force" : "row.cancel")}
            </Button>
          </>
        }
      />
    </div>
  );
}
