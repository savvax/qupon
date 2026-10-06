"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Address } from "@/components/ui/Address";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { TextField } from "@/components/ui/TextField";
import { boPost } from "@/lib/boClient";
import type { KycApplication, KycResult } from "@/lib/kyc";
import { useRunWrite } from "@/lib/useRunWrite";

type ApproveResponse = {
  ok: boolean;
  status: KycApplication["status"];
  results: KycResult[];
  signatures?: string[];
};

/**
 * Approve (attest the wallet in SAS and register it in every requested series — on-chain, idempotent) or reject
 * with a reason. A partial failure keeps the application under review and lists per-series errors.
 */
export function KycDecision({
  application,
  tickers,
}: {
  application: KycApplication;
  tickers: Record<string, string>;
}) {
  const t = useTranslations("kyc.registrar.decision");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [status, setStatus] = useState(application.status);
  const [results, setResults] = useState<KycResult[]>(
    application.results ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const approve = async () => {
    setBusy(true);
    const res = await runWrite<ApproveResponse>({
      pending: t("approving"),
      success: (r) => (r.ok ? t("approved") : t("partial")),
      call: () => boPost(`registrar/kyc/${application.id}/approve`, {}),
      txs: (r) => r.signatures ?? r.results.flatMap((x) => x.signatures),
    });
    setBusy(false);
    if (res) {
      setStatus(res.status);
      setResults(res.results);
      router.refresh();
    }
  };

  const reject = async () => {
    if (!reason.trim()) return;
    setBusy(true);
    const res = await runWrite<{
      ok: boolean;
      status: KycApplication["status"];
    }>({
      pending: t("rejecting"),
      success: () => t("rejected"),
      call: () =>
        boPost(`registrar/kyc/${application.id}/reject`, {
          reason: reason.trim(),
        }),
    });
    setBusy(false);
    if (res) {
      setStatus(res.status);
      setRejectOpen(false);
      router.refresh();
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold">{t("title")}</h2>
      {status === "submitted" ? (
        <>
          <p className="mt-1 text-sm text-n600">{t("lead")}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button block loading={busy} onClick={() => void approve()}>
              {t("approve")}
            </Button>
            <Button
              block
              variant="secondary"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              {t("reject")}
            </Button>
          </div>
        </>
      ) : (
        <p className="mt-1 text-sm text-n600">
          {status === "approved" ? t("doneApproved") : t("doneRejected")}
          {status === "rejected" && application.reason
            ? ` ${application.reason}`
            : ""}
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-4 space-y-2">
          {results.map((r) => (
            <li
              key={r.series}
              className="rounded-card border border-n200 px-3 py-2 text-sm"
              data-ok={!r.error}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">
                  {tickers[r.series] ?? r.series.slice(0, 6)}
                </span>
                <span
                  className={
                    r.error
                      ? "text-xs font-semibold text-err-fg"
                      : "text-xs font-semibold text-g700"
                  }
                >
                  {r.error ? t("seriesFailed") : t("seriesDone")}
                </span>
              </div>
              {r.error && (
                <p className="mt-1 text-xs break-words text-err-fg">
                  {r.error}
                </p>
              )}
              {r.signatures.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {r.signatures.map((s) => (
                    <Address key={s} value={s} kind="tx" />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Dialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={t("rejectTitle")}
        description={t("rejectLead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setRejectOpen(false)}
              disabled={busy}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              loading={busy}
              disabled={!reason.trim()}
              onClick={() => void reject()}
            >
              {t("reject")}
            </Button>
          </>
        }
      >
        <TextField
          label={t("reason")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          autoFocus
        />
      </Dialog>
    </Card>
  );
}
