"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { boUploadWithProgress } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

export type DocumentRow = {
  id: number;
  kind: string;
  filename: string;
  size: number;
  seriesMint: string | null;
  createdAt: number;
};

const KINDS = ["prospectus", "decision", "other"] as const;

/** Upload form for issue documents (PDF/PNG/JPEG ≤ 10 MB) with progress. */
export function DocumentsPanel() {
  const t = useTranslations("org.documents");
  const runWrite = useRunWrite();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState<string>("prospectus");
  const [file, setFile] = useState("");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const upload = async () => {
    const file = fileRef.current?.files?.[0];
    if (busy || !file) return;
    setBusy(true);
    setProgress(0);
    const ok = await runWrite({
      pending: t("uploading"),
      success: () => t("uploaded"),
      call: () =>
        boUploadWithProgress<{ document: DocumentRow }>(
          "me/documents",
          file,
          kind,
          setProgress,
        ),
    });
    setBusy(false);
    if (ok && fileRef.current) {
      fileRef.current.value = "";
      router.refresh();
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[13px] font-semibold text-n700">
            {t("file")}
          </span>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
            aria-label={t("file")}
            onChange={(e) => setFile(e.target.files?.[0]?.name ?? "")}
            className="w-full text-sm text-n700 file:mr-3 file:rounded-btn file:border-0 file:bg-n100 file:px-3 file:py-2 file:text-sm file:font-semibold hover:file:bg-n200"
          />
          <span className="mt-1 block text-xs text-n500">{t("fileHint")}</span>
        </label>
        <Select
          label={t("kind")}
          value={kind}
          onValueChange={setKind}
          options={KINDS.map((k) => ({
            value: k,
            label: t(`kinds.${k}`),
          }))}
        />
      </div>
      {busy && (
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          className="h-1.5 overflow-hidden rounded-full bg-n100"
        >
          <div
            className="h-full bg-g500 transition-[width] duration-150"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      )}
      <Button onClick={() => void upload()} disabled={busy || !file}>
        {busy ? t("uploading") : t("submit")}
      </Button>
    </div>
  );
}
