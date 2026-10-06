"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { boPost } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";
import type { DocumentRow } from "../../documents/DocumentsPanel";

const KINDS = ["prospectus", "decision", "other"] as const;

/** Publish one of the organisation's uploads on the series (POST /issuer/series/{mint}/documents). */
export function AttachForm({
  mint,
  documents,
}: {
  mint: string;
  documents: DocumentRow[];
}) {
  const t = useTranslations("org.series");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [docID, setDocID] = useState<string>(
    documents[0] ? String(documents[0].id) : "",
  );
  const [kind, setKind] = useState<string>("prospectus");
  const [busy, setBusy] = useState(false);

  const attach = async () => {
    if (busy || !docID) return;
    setBusy(true);
    const ok = await runWrite({
      pending: t("attaching"),
      success: () => t("attached"),
      call: () =>
        boPost(`issuer/series/${mint}/documents`, {
          documentId: Number(docID),
          kind,
        }),
    });
    setBusy(false);
    if (ok) router.refresh();
  };

  if (documents.length === 0) {
    return <p className="text-sm text-n600">{t("pickNone")}</p>;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1">
        <Select
          label={t("pick")}
          value={docID}
          onValueChange={setDocID}
          options={documents.map((d) => ({
            value: String(d.id),
            label: `${d.filename} (${t(`kinds.${d.kind}`)})`,
          }))}
        />
      </div>
      <div className="w-full sm:w-44">
        <Select
          label={t("kind")}
          value={kind}
          onValueChange={setKind}
          options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
        />
      </div>
      <Button onClick={() => void attach()} disabled={busy || !docID}>
        {busy ? t("attaching") : t("attachBtn")}
      </Button>
    </div>
  );
}
