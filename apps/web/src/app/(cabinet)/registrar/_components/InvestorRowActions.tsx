"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { shortKey } from "@/lib/format";
import { boPost } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

type SuspendResponse = { signatures: string[]; skipped?: boolean };

/** Suspend / Reinstate with a confirm dialog; refreshes the server-rendered table on success. */
export function InvestorRowActions({
  mint,
  owner,
  status,
}: {
  mint: string;
  owner: string;
  status: string;
}) {
  const t = useTranslations("registrar.investors");
  const common = useTranslations("common");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const suspended = status === "Suspended";
  const verb = suspended ? "reinstate" : "suspend";

  const submit = async () => {
    setBusy(true);
    const res = await runWrite<SuspendResponse>({
      pending: t(suspended ? "reinstatePending" : "suspendPending"),
      success: () => t(suspended ? "reinstateSuccess" : "suspendSuccess"),
      call: () =>
        boPost<SuspendResponse>(
          `registrar/investors/${mint}/${owner}/${verb}`,
          {},
        ),
      txs: (r) => r.signatures ?? [],
    });
    setBusy(false);
    if (res) {
      setConfirmOpen(false);
      router.refresh();
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant={suspended ? "secondary" : "destructive"}
        onClick={() => setConfirmOpen(true)}
      >
        {t(suspended ? "reinstate" : "suspend")}
      </Button>
      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => !busy && setConfirmOpen(open)}
        title={t(suspended ? "confirmReinstateTitle" : "confirmSuspendTitle")}
        description={`${shortKey(owner)} · ${t(suspended ? "confirmReinstateBody" : "confirmSuspendBody")}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={busy}
            >
              {common("close")}
            </Button>
            <Button
              variant={suspended ? "primary" : "destructive"}
              loading={busy}
              onClick={() => void submit()}
            >
              {t(suspended ? "reinstate" : "suspend")}
            </Button>
          </>
        }
      />
    </>
  );
}
