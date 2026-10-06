"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Select } from "@/components/ui/Select";
import { TextField } from "@/components/ui/TextField";
import { boPost, boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

/** One organizations row as internal/store/organizations.go serialises it. */
export type OrgDTO = {
  id: number;
  name: string;
  kind: string;
  bin: string;
  website: string;
  createdAt: number;
};

const KINDS = ["issuer", "registrar"] as const;

/**
 * Create + edit controls for /admin/organizations (platform v2 §5.2).
 * Without `org` renders the header "Create organisation" button; with `org`
 * the row's "Edit" button and dialog.
 */
export function OrgControls({ org }: { org?: OrgDTO }) {
  const t = useTranslations("admin.orgs");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(org?.name ?? "");
  const [kind, setKind] = useState<string>(org?.kind ?? "issuer");
  const [bin, setBin] = useState(org?.bin ?? "");
  const [website, setWebsite] = useState(org?.website ?? "");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setName(org?.name ?? "");
    setKind(org?.kind ?? "issuer");
    setBin(org?.bin ?? "");
    setWebsite(org?.website ?? "");
  };

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const res = await runWrite<{ organization: OrgDTO }>({
      pending: t(org ? "edit.pending" : "create.pending"),
      success: () => t(org ? "edit.success" : "create.success"),
      call: () =>
        org
          ? boSend<{ organization: OrgDTO }>(
              "PATCH",
              `admin/organizations/${org.id}`,
              {
                name: name.trim(),
                kind,
                bin: bin.trim(),
                website: website.trim(),
              },
            )
          : boPost<{ organization: OrgDTO }>("admin/organizations", {
              name: name.trim(),
              kind,
              bin: bin.trim(),
              website: website.trim(),
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
      <Button
        size={org ? "sm" : "md"}
        variant={org ? "ghost" : "primary"}
        onClick={() => setOpen(true)}
      >
        {t(org ? "edit.title" : "create.title")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => !busy && setOpen(o)}
        title={t(org ? "edit.title" : "create.title")}
        description={org ? org.name : t("create.lead")}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              ✕
            </Button>
            <Button
              loading={busy}
              disabled={!name.trim()}
              onClick={() => void save()}
            >
              {t(org ? "edit.submit" : "create.submit")}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <TextField
            label={t("colName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Select
            label={t("colKind")}
            value={kind}
            onValueChange={setKind}
            options={KINDS.map((k) => ({ value: k, label: t(`kinds.${k}`) }))}
          />
          <TextField
            label={t("colBin")}
            hint={t("binHint")}
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            placeholder="123456789012"
            spellCheck={false}
          />
          <TextField
            label={t("colWebsite")}
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://example.kz"
            spellCheck={false}
          />
        </div>
      </Dialog>
    </>
  );
}
