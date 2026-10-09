"use client";

import { formatDateTime } from "@/lib/format";
import { toLocale, type Locale } from "@/i18n/locale";
import { AnimatePresence, m } from "motion/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useRef, useState } from "react";
import { type LinkedWallet, WalletLink } from "@/components/account/WalletLink";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { boPost, boUploadWithProgress } from "@/lib/boClient";
import {
  type KycApplication,
  type KycDocument,
  defaultTaxBps,
  formatBytes,
  pct,
} from "@/lib/kyc";
import { cx } from "@/lib/ui/cx";
import { useRunWrite } from "@/lib/useRunWrite";

type SeriesOption = { mint: string; ticker: string; isin: string };
type Step = "wallet" | "documents" | "details" | "status";

/**
 * Investor KYC (spec §5.3): link a wallet → upload documents → details → submitted / decision. Review is
 * SIMULATED: no vendor, a registrar decides by hand.
 */
export function KycFlow({
  application,
  wallets,
  documents: initialDocs,
  series,
}: {
  application: KycApplication | null;
  wallets: LinkedWallet[];
  documents: KycDocument[];
  series: SeriesOption[];
}) {
  const t = useTranslations("kyc.investor");
  const locale = toLocale(useLocale());
  const [app, setApp] = useState(application);
  const [docs, setDocs] = useState(initialDocs);
  const reapplying = app?.status === "rejected";
  const [editing, setEditing] = useState(false);
  const hasWallet = wallets.length > 0;
  const hasId = docs.some((d) => d.kind === "id_document");
  const step: Step =
    app && !(reapplying && editing)
      ? "status"
      : !hasWallet
        ? "wallet"
        : !hasId
          ? "documents"
          : "details";
  const order: Step[] = ["wallet", "documents", "details", "status"];
  const at = order.indexOf(step);

  return (
    <div className="space-y-6">
      <Stepper
        steps={order.map((s, i) => ({
          key: s,
          label: t(`steps.${s}`),
          state:
            i < at || (s === "status" && app?.status === "approved")
              ? "done"
              : i === at
                ? "current"
                : "todo",
        }))}
      />
      <AnimatePresence mode="wait">
        <m.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {step === "wallet" && (
            <Card>
              <h2 className="text-lg font-bold">{t("wallet.title")}</h2>
              <p className="mt-1 mb-4 text-sm text-n600">{t("wallet.lead")}</p>
              <WalletLink wallets={wallets} />
            </Card>
          )}
          {step === "documents" && (
            <Documents
              docs={docs}
              onUploaded={(d) => setDocs((x) => [d, ...x])}
            />
          )}
          {step === "details" && (
            <Details
              wallets={wallets}
              docs={docs}
              series={series}
              locale={locale}
              onSubmitted={(a) => {
                setApp(a);
                setEditing(false);
              }}
            />
          )}
          {step === "status" && app && (
            <Status
              app={app}
              series={series}
              onReapply={() => setEditing(true)}
            />
          )}
        </m.div>
      </AnimatePresence>
      <p className="text-xs text-n500">{t("simulated")}</p>
    </div>
  );
}

function Documents({
  docs,
  onUploaded,
}: {
  docs: KycDocument[];
  onUploaded: (d: KycDocument) => void;
}) {
  const t = useTranslations("kyc.investor.documents");
  const [kind, setKind] = useState<"id_document" | "proof_of_address">(
    "id_document",
  );
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const upload = async (file: File | undefined) => {
    if (!file || progress !== null) return;
    setError(undefined);
    if (file.size > 10 * 1024 * 1024) {
      setError(t("tooLarge"));
      return;
    }
    setProgress(0);
    try {
      const { document } = await boUploadWithProgress<{
        document: KycDocument;
      }>("me/documents", file, kind, setProgress);
      onUploaded(document);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        t(
          code === "unsupported_type"
            ? "unsupported"
            : code === "too_large"
              ? "tooLarge"
              : "failed",
        ),
      );
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <p className="mt-1 text-sm text-n600">{t("lead")}</p>
      <div className="mt-4 max-w-xs">
        <Select
          label={t("kind")}
          value={kind}
          onValueChange={(v) => setKind(v as typeof kind)}
          options={[
            { value: "id_document", label: t("kinds.id_document") },
            { value: "proof_of_address", label: t("kinds.proof_of_address") },
          ]}
        />
      </div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files[0]);
        }}
        className={cx(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors",
          dragging
            ? "border-g500 bg-g50"
            : "border-n300 bg-n50 hover:border-g400",
        )}
      >
        <span className="text-sm font-semibold text-n800">{t("drop")}</span>
        <span className="text-xs text-n500">{t("formats")}</span>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          className="sr-only"
          aria-label={t("choose")}
          onChange={(e) => void upload(e.target.files?.[0])}
        />
        {progress !== null && (
          <span className="mt-2 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-n200">
            <span
              className="block h-full origin-left rounded-full bg-g500 transition-transform duration-200"
              style={{ transform: `scaleX(${progress})` }}
            />
          </span>
        )}
      </label>
      {error && (
        <p role="alert" className="mt-3 text-sm font-semibold text-err-fg">
          {error}
        </p>
      )}
      {docs.length > 0 && (
        <ul className="mt-4 divide-y divide-n100 rounded-card border border-n200">
          {docs.map((d) => (
            <li
              key={d.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
            >
              <Badge tone="neutral">
                {t(
                  `kinds.${d.kind === "proof_of_address" ? "proof_of_address" : "id_document"}`,
                )}
              </Badge>
              <a
                href={`/api/bo-get/documents/${d.id}`}
                className="min-w-0 flex-1 truncate font-semibold text-g700 hover:underline"
              >
                {d.filename}
              </a>
              <span className="text-xs text-n500">{formatBytes(d.size)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Details({
  wallets,
  docs,
  series,
  locale,
  onSubmitted,
}: {
  wallets: LinkedWallet[];
  docs: KycDocument[];
  series: SeriesOption[];
  locale: Locale;
  onSubmitted: (a: KycApplication) => void;
}) {
  const t = useTranslations("kyc.investor.details");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [wallet, setWallet] = useState(wallets[0]?.address ?? "");
  const [investorType, setType] = useState<"individual" | "legal_entity">(
    "individual",
  );
  const [residency, setResidency] = useState<"resident" | "nonresident">(
    "resident",
  );
  const [picked, setPicked] = useState<string[]>(
    series.slice(0, 1).map((s) => s.mint),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const valid = fullName.trim().length >= 2 && wallet && picked.length > 0;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    const res = await runWrite<{ application: KycApplication }>({
      pending: t("submitting"),
      success: () => t("submitted"),
      call: () =>
        boPost("me/kyc", {
          wallet,
          investorType,
          residency,
          taxBps: defaultTaxBps(residency),
          fullName: fullName.trim(),
          documentIds: docs.map((d) => d.id),
          seriesMints: picked,
        }),
      onError: (err) =>
        setError(
          err.code === "kyc_pending"
            ? t("pending")
            : err.code === "wallet_not_linked"
              ? t("walletNotLinked")
              : undefined,
        ),
    });
    setBusy(false);
    if (res) {
      onSubmitted(res.application);
      router.refresh();
    }
  };

  return (
    <Card>
      <h2 className="text-lg font-bold">{t("title")}</h2>
      <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2">
        <TextField
          label={t("fullName")}
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          autoComplete="name"
          required
        />
        <Select
          label={t("wallet")}
          value={wallet}
          onValueChange={setWallet}
          options={wallets.map((w) => ({
            value: w.address,
            label: `${w.address.slice(0, 4)}…${w.address.slice(-4)}`,
          }))}
        />
        <Select
          label={t("type")}
          value={investorType}
          onValueChange={(v) => setType(v as typeof investorType)}
          options={[
            { value: "individual", label: t("types.individual") },
            { value: "legal_entity", label: t("types.legal_entity") },
          ]}
        />
        <Select
          label={t("residency")}
          value={residency}
          onValueChange={(v) => setResidency(v as typeof residency)}
          options={[
            { value: "resident", label: t("residencies.resident") },
            { value: "nonresident", label: t("residencies.nonresident") },
          ]}
        />
        <p className="text-sm text-n600 sm:col-span-2">
          {t("tax", { rate: pct(defaultTaxBps(residency), locale) })}
        </p>
        <fieldset className="sm:col-span-2">
          <legend className="mb-2 text-sm font-semibold text-n800">
            {t("series")}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {series.map((s) => {
              const on = picked.includes(s.mint);
              return (
                <label
                  key={s.mint}
                  className={cx(
                    "flex cursor-pointer items-center gap-3 rounded-card border px-4 py-3 transition-colors",
                    on ? "border-g400 bg-g50" : "border-n200 hover:border-n300",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((x) =>
                        on ? x.filter((m) => m !== s.mint) : [...x, s.mint],
                      )
                    }
                    className="size-4 accent-[var(--color-g600)]"
                  />
                  <span className="min-w-0">
                    <span className="block font-bold">{s.ticker}</span>
                    <span className="block text-xs text-n500">{s.isin}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        {error && (
          <p
            role="alert"
            className="text-sm font-semibold text-err-fg sm:col-span-2"
          >
            {error}
          </p>
        )}
        <div className="sm:col-span-2">
          <Button type="submit" size="lg" loading={busy} disabled={!valid}>
            {t("submit")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function Status({
  app,
  series,
  onReapply,
}: {
  app: KycApplication;
  series: SeriesOption[];
  onReapply: () => void;
}) {
  const t = useTranslations("kyc.investor.status");
  const locale = useLocale();
  const ticker = (mint: string) =>
    series.find((s) => s.mint === mint)?.ticker ?? `${mint.slice(0, 4)}…`;
  const tone =
    app.status === "approved"
      ? "success"
      : app.status === "rejected"
        ? "danger"
        : "warn";
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-bold">{t("title")}</h2>
        <Badge tone={tone}>{t(`states.${app.status}`)}</Badge>
      </div>
      <p className="mt-2 text-sm text-n600">{t(`lead.${app.status}`)}</p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-semibold text-n500">
            {t("submittedAt")}
          </dt>
          <dd className="mt-0.5">
            {formatDateTime(
              new Date(app.createdAt * 1000).toISOString(),
              locale,
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-n500">{t("wallet")}</dt>
          <dd className="mt-0.5">
            <Address value={app.wallet} />
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold text-n500">{t("series")}</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {app.seriesMints.map((mint) => (
              <Badge key={mint} tone="neutral">
                {ticker(mint)}
              </Badge>
            ))}
          </dd>
        </div>
      </dl>
      {app.status === "rejected" && (
        <div className="mt-4 rounded-card bg-err-bg p-4 text-sm text-err-fg">
          <div className="font-bold">{t("reason")}</div>
          <p className="mt-1">{app.reason}</p>
          <Button className="mt-3" variant="secondary" onClick={onReapply}>
            {t("reapply")}
          </Button>
        </div>
      )}
    </Card>
  );
}
