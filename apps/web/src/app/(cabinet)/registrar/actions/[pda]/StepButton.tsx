"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { boPost, type BoError } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

type AdvanceResult = {
  step?: string;
  signature?: string | null;
  signatures?: string[];
};

/**
 * Runs the action's next step (POST /api/bo/registrar/actions/{pda}/advance), then refreshes the server tree
 * every 2.5 s (≤ 60 s) until the on-chain status or a batch counter moves — devnet reads lag the confirmation
 * (task 1418). Snapshot/pay/retire land in batches without a status change, so the caller passes those counters
 * as `progress` and the wait ends on either change (task 1423). The button stays loading for the whole wait.
 * Errors stay visible under the button; a series outside the executor registry turns the panel read-only.
 */
export function StepButton({
  pda,
  label,
  status,
  progress = "",
  secondary = false,
}: {
  pda: string;
  label: string;
  status: string;
  /** Batch progress key (unitsSnapshotted/holdersPaid/holdersRetired) — changes while the status holds. */
  progress?: string;
  secondary?: boolean;
}) {
  const t = useTranslations("action");
  const router = useRouter();
  const runWrite = useRunWrite();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [readOnly, setReadOnly] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const polledFrom = useRef<string | null>(null);

  const stopPolling = () => {
    for (const id of timers.current) clearTimeout(id);
    timers.current = [];
    polledFrom.current = null;
  };
  const watch = `${status}|${progress}`;
  useEffect(() => {
    // the chain reader caught up (status moved or a batch landed): end the wait and re-enable the button
    if (polledFrom.current !== null && polledFrom.current !== watch) {
      stopPolling();
      setBusy(false);
    }
  }, [watch]);
  useEffect(() => stopPolling, []);

  if (readOnly) {
    return (
      <p className="max-w-xs rounded-btn bg-p50 px-3 py-2 text-sm text-p700">
        {t("readOnly")}
      </p>
    );
  }

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const res = await runWrite<AdvanceResult>({
      pending: t("sending", { step: label }),
      success: () => t("stepDone", { step: label }),
      call: () =>
        boPost(`registrar/actions/${pda}/advance`, {
          confirm: true,
          autofund: true,
        }),
      txs: (r) => [r.signature ?? r.signatures?.[0] ?? ""].filter(Boolean),
      onError: (e: BoError, text: string) => {
        if (e.code === "unknown_series") setReadOnly(true);
        else setError(text);
      },
    });
    if (!res) {
      setBusy(false);
      return;
    }
    // Success: the button stays loading until polling sees the status or progress move, or the 60 s budget
    // ends — devnet reads lag the confirmation, so re-enabling now would allow a double submit (task 1418).
    stopPolling();
    polledFrom.current = watch;
    for (let i = 1; i <= 24; i++)
      timers.current.push(setTimeout(() => router.refresh(), i * 2500));
    timers.current.push(
      setTimeout(
        () => {
          stopPolling();
          setBusy(false);
        },
        24 * 2500 + 50,
      ),
    );
  };

  return (
    <div className="flex flex-col items-stretch gap-2 sm:items-end">
      <Button
        variant={secondary ? "secondary" : "primary"}
        size={secondary ? "md" : "lg"}
        loading={busy}
        onClick={run}
      >
        {label}
      </Button>
      {error && (
        <p
          role="alert"
          className="max-w-sm rounded-btn border border-err-bd bg-err-bg px-3 py-2 text-sm text-err-fg"
        >
          {error}
        </p>
      )}
    </div>
  );
}
