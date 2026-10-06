"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { disclosureZipUrl, postDisclosureSubmit } from "@/lib/api";
import { useRunWrite } from "@/lib/useRunWrite";

/**
 * "Disclosure package" card (platform v2 §5.5): download the ZIP (notices
 * RU/EN, seev.031, seev.036 per holder, manifest) and "Submit to KASE" —
 * the submission is SIMULATED and records an audit row only.
 */
export function DisclosurePanel({ pda }: { pda: string }) {
  const t = useTranslations("kase.disclosure");
  const runWrite = useRunWrite();
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await runWrite({
        pending: t("submitPending"),
        success: () => t("submitted"),
        call: () => postDisclosureSubmit(pda),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="rounded-card border border-n200 bg-n0 p-5">
      <h3 className="font-bold">{t("title")}</h3>
      <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" asChild>
          <a href={disclosureZipUrl(pda)} download>
            {t("download")}
          </a>
        </Button>
        <Button size="sm" loading={busy} onClick={submit}>
          {t("submit")}
        </Button>
      </div>
      <p className="mt-3 max-w-prose text-xs text-n500">{t("note")}</p>
    </section>
  );
}
