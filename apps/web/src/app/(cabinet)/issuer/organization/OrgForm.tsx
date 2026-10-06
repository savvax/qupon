"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";
import type { Org } from "./page";

/** Editable organisation fields (name, BIN, website); the kind is fixed by the admin. */
export function OrgForm({ org }: { org: Org }) {
  const t = useTranslations("org.profile");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [name, setName] = useState(org.name);
  const [bin, setBin] = useState(org.bin);
  const [website, setWebsite] = useState(org.website);
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const ok = await runWrite({
      pending: t("saving"),
      success: () => t("saved"),
      call: () => boSend("PATCH", "org", { name, bin, website }),
    });
    setBusy(false);
    if (ok) router.refresh();
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("name")}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <TextField
          label={t("kind")}
          value={t.has(`kinds.${org.kind}`) ? t(`kinds.${org.kind}`) : org.kind}
          disabled
          readOnly
        />
        <TextField
          label={t("bin")}
          value={bin}
          onChange={(e) => setBin(e.target.value)}
          hint={t("binHint")}
        />
        <TextField
          label={t("website")}
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          inputMode="url"
        />
      </div>
      <Button type="submit" disabled={busy || name.trim().length < 2}>
        {busy ? t("saving") : t("save")}
      </Button>
    </form>
  );
}
