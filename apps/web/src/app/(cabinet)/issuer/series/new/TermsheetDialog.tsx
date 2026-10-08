"use client";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { boPost, type BoError } from "@/lib/boClient";

/** One parsed field: `missing` means the text had nothing usable (the wizard keeps its value). */
export type TermField<T> = {
  value: T;
  confidence: "high" | "medium" | "low" | "missing";
};

/** `POST /issuer/import/termsheet` answer (services/registrar/internal/termsheet). */
export type TermsheetParse = {
  source: "llm" | "regex";
  simulated: boolean;
  terms: {
    isin: TermField<string>;
    ticker: TermField<string>;
    issuerName: TermField<string>;
    faceValue: TermField<number>; // minor units
    currency: TermField<string>;
    couponBps: TermField<number>;
    frequency: TermField<number>;
    dayCount: TermField<string>;
    issueDate: TermField<string>;
    maturityDate: TermField<string>;
  };
};

type Key = keyof TermsheetParse["terms"];
const ORDER: Key[] = [
  "isin",
  "ticker",
  "issuerName",
  "faceValue",
  "currency",
  "couponBps",
  "frequency",
  "dayCount",
  "issueDate",
  "maturityDate",
];

/** Human form of a parsed value for the review table. */
function show(key: Key, f: TermField<string | number>): string {
  if (f.confidence === "missing") return "—";
  if (key === "faceValue") return (Number(f.value) / 100).toFixed(2);
  if (key === "couponBps") return `${(Number(f.value) / 100).toFixed(2)}%`;
  return String(f.value);
}

/**
 * EXPERIMENTAL term-sheet import (task 042): paste KASE text, parse it on the
 * registrar (LLM or the SIMULATED regex fallback), review every field, then
 * hand the parse to the wizard. Nothing is stored; the issuer confirms in the form.
 */
export function TermsheetDialog({
  onApply,
}: {
  onApply: (parse: TermsheetParse) => void;
}) {
  const t = useTranslations("termsheet");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [parse, setParse] = useState<TermsheetParse>();

  const doParse = async () => {
    if (busy) return;
    if (!text.trim()) {
      setError(t("errors.empty"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      setParse(
        await boPost<TermsheetParse>("issuer/import/termsheet", { text }),
      );
    } catch (e) {
      const code = (e as BoError).code;
      setError(
        t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.default"),
      );
      setParse(undefined);
    } finally {
      setBusy(false);
    }
  };

  const close = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setParse(undefined);
      setError("");
    }
  };

  return (
    <>
      <Button type="button" variant="ghost" onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
      <Dialog
        open={open}
        onOpenChange={close}
        title={t("title")}
        description={t("lead")}
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => close(false)}>
              {t("cancel")}
            </Button>
            {parse ? (
              <Button
                type="button"
                onClick={() => {
                  onApply(parse);
                  close(false);
                }}
              >
                {t("apply")}
              </Button>
            ) : (
              <Button type="button" loading={busy} onClick={doParse}>
                {busy ? t("parsing") : t("parse")}
              </Button>
            )}
          </>
        }
      >
        {parse ? (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-xs text-n600">
              <Badge tone={parse.simulated ? "warn" : "success"}>
                {parse.simulated ? "SIMULATED" : parse.source.toUpperCase()}
              </Badge>
              {parse.simulated ? t("sourceRegex") : t("sourceLlm")}
            </p>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-n500">
                <tr>
                  <th className="py-1 font-semibold">{t("columns.field")}</th>
                  <th className="py-1 font-semibold">{t("columns.value")}</th>
                  <th className="py-1 font-semibold">
                    {t("columns.confidence")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {ORDER.map((key) => {
                  const f = parse.terms[key];
                  return (
                    <tr key={key} className="border-t border-n200">
                      <th className="py-1.5 pr-2 text-left font-medium text-n700">
                        {t(`fields.${key}`)}
                      </th>
                      <td className="py-1.5 pr-2 font-mono tabular-nums">
                        {show(key, f)}
                      </td>
                      <td className="py-1.5 text-xs text-n500">
                        {t(`confidence.${f.confidence}`)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div>
            <label
              htmlFor={id}
              className="mb-1 block text-[13px] font-semibold text-n700"
            >
              {t("text")}
            </label>
            <textarea
              id={id}
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("placeholder")}
              maxLength={65536}
              aria-invalid={error ? true : undefined}
              className="w-full rounded-btn border border-n300 bg-n0 px-3 py-2 text-sm focus:border-g600"
            />
            {error && <p className="mt-1 text-xs text-err-fg">{error}</p>}
          </div>
        )}
      </Dialog>
    </>
  );
}
