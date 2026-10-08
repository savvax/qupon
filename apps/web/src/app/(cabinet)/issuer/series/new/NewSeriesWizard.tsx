"use client";
import { StableText } from "@/components/i18n/StableLabel";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Address } from "@/components/ui/Address";
import { Amount } from "@/components/ui/Amount";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Stepper } from "@/components/ui/Stepper";
import { TextField } from "@/components/ui/TextField";
import { boPost } from "@/lib/boClient";
import { type CashOption, cashField, cashSuffix } from "@/lib/cashAssets";
import { compareKaseSchedule, type KaseBond } from "@/lib/kase";
import {
  addMonthsYmd,
  parseMajor,
  parseRateBps,
  schedulePreview,
  type DayCountId,
} from "@/lib/schedulePreview";
import { useRunWrite } from "@/lib/useRunWrite";
import { importFromKase } from "./kaseImport";
import { TermsheetDialog, type TermsheetParse } from "./TermsheetDialog";

type Created = { series?: string; mint?: string; signatures: string[] };

const todayAlmaty = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(
    new Date(),
  );

/** Three steps — terms, schedule preview, review — then one request that mints and initialises the series. */
export function NewSeriesWizard({ assets }: { assets: CashOption[] }) {
  const t = useTranslations("issuer.wizard");
  const locale = useLocale() === "ru" ? "ru" : "en";
  const runWrite = useRunWrite();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<Created>();
  const [f, setF] = useState(() => {
    const issue = todayAlmaty();
    return {
      name: "",
      isin: "",
      cash: assets[0]?.key ?? "",
      face: "1000",
      rate: "10",
      frequency: "2",
      dayCount: "THIRTY_360" as DayCountId,
      issueDate: issue,
      maturityDate: addMonthsYmd(issue, 24),
    };
  });
  const set = (k: keyof typeof f) => (v: string) =>
    setF((p) => ({ ...p, [k]: v }));

  const tk = useTranslations("kase.import");
  const tts = useTranslations("termsheet");
  const tc = useTranslations("kase.compare");
  const [kase, setKase] = useState<KaseBond>();
  const [kaseTicker, setKaseTicker] = useState("");
  const [kaseError, setKaseError] = useState("");
  const [importing, setImporting] = useState(false);

  /** Import from KASE (task 1002): prefill every term from kase.kz's normalised bond. */
  const doImport = async () => {
    if (importing) return;
    if (!/^[A-Za-z0-9]{2,12}$/.test(kaseTicker)) {
      setKaseError("invalid_ticker");
      return;
    }
    setImporting(true);
    setKaseError("");
    const res = await importFromKase(kaseTicker);
    setImporting(false);
    if (res.ok) {
      setKase(res.bond);
      setKaseError("");
      setF((p) => ({
        ...p,
        name: res.bond.ticker,
        isin: res.bond.isin || p.isin,
        face: res.bond.face > 0 ? String(res.bond.face / 100) : p.face,
        rate: (res.bond.couponRate / 100).toFixed(2),
        frequency: res.bond.frequency
          ? String(res.bond.frequency)
          : p.frequency,
        dayCount: res.bond.dayCount || p.dayCount,
        issueDate: res.bond.issueDate || p.issueDate,
        maturityDate: res.bond.maturityDate || p.maturityDate,
      }));
    } else {
      setKase(undefined);
      setKaseError(res.code);
    }
  };

  /** EXPERIMENTAL term-sheet import (task 042): the second source for the same fields the KASE import fills.
   * Missing fields keep whatever the form already had. */
  const [termsheetApplied, setTermsheetApplied] = useState(false);
  const applyTermsheet = ({ terms }: TermsheetParse) => {
    const has = (x: { confidence: string }) => x.confidence !== "missing";
    setF((p) => ({
      ...p,
      name: has(terms.ticker) ? terms.ticker.value : p.name,
      isin: has(terms.isin) ? terms.isin.value : p.isin,
      face: has(terms.faceValue) ? String(terms.faceValue.value / 100) : p.face,
      rate: has(terms.couponBps)
        ? (terms.couponBps.value / 100).toFixed(2)
        : p.rate,
      frequency: has(terms.frequency)
        ? String(terms.frequency.value)
        : p.frequency,
      dayCount: has(terms.dayCount)
        ? (terms.dayCount.value as DayCountId)
        : p.dayCount,
      issueDate: has(terms.issueDate) ? terms.issueDate.value : p.issueDate,
      maturityDate: has(terms.maturityDate)
        ? terms.maturityDate.value
        : p.maturityDate,
    }));
    setTermsheetApplied(true);
  };

  const asset = assets.find((a) => a.key === f.cash) ?? assets[0];
  const decimals = asset?.decimals ?? 2;
  // Same rules as the API (services/registrar/internal/api/issuer.go) and init_series on-chain.
  const faceMinor = parseMajor(f.face, decimals);
  const rateBps = parseRateBps(f.rate);
  const freq = Number(f.frequency) as 1 | 2 | 4 | 12;
  const firstCoupon = /^\d{4}-\d{2}-\d{2}$/.test(f.issueDate)
    ? addMonthsYmd(f.issueDate, 12 / freq)
    : "";
  const errors: Partial<Record<keyof typeof f, string>> = {};
  if (!/^[A-Za-z0-9-]{1,16}$/.test(f.name)) errors.name = t("errors.name");
  if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(f.isin))
    errors.isin = t("errors.isin");
  if (faceMinor === undefined) errors.face = t("errors.face", { decimals });
  if (rateBps === undefined) errors.rate = t("errors.rate");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.issueDate))
    errors.issueDate = t("errors.date");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(f.maturityDate) ||
    f.maturityDate < firstCoupon
  )
    errors.maturityDate = t("errors.maturity", { date: firstCoupon });
  const valid = Object.keys(errors).length === 0;
  const [touched, setTouched] = useState(false);
  const err = (k: keyof typeof f) => (touched ? errors[k] : undefined);

  const rows = useMemo(
    () =>
      valid && faceMinor !== undefined && rateBps !== undefined
        ? schedulePreview({
            faceMinor,
            rateBps,
            frequency: freq,
            dayCount: f.dayCount,
            issueDate: f.issueDate,
            maturityDate: f.maturityDate,
          })
        : [],
    [valid, faceMinor, rateBps, freq, f.dayCount, f.issueDate, f.maturityDate],
  );
  const totalCoupons = rows.reduce((a, r) => a + r.perUnitMinor, 0n);
  const currency = asset?.symbol ?? "";

  const issue = async () => {
    if (
      busy ||
      !valid ||
      !asset ||
      faceMinor === undefined ||
      rateBps === undefined
    )
      return;
    setBusy(true);
    const res = await runWrite<Created>({
      pending: t("issuing"),
      success: (r) => t("issued", { name: r.series ?? f.name }),
      call: () =>
        boPost("issuer/series", {
          name: f.name,
          isin: f.isin,
          faceValue: Number(faceMinor),
          couponRateBps: rateBps,
          frequency: freq,
          dayCount: f.dayCount,
          issueDate: f.issueDate,
          maturityDate: f.maturityDate,
          ...cashField(asset),
        }),
      txs: (r) => r.signatures,
    });
    setBusy(false);
    if (res) setCreated(res);
  };

  if (created) {
    return (
      <div className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8">
        <div className="flex size-12 items-center justify-center rounded-full bg-g50 text-2xl text-g700">
          ✓
        </div>
        <h2 className="mt-4 text-2xl font-extrabold tracking-tight">
          <StableText>
            {t("doneTitle", { name: created.series ?? f.name })}
          </StableText>
        </h2>
        <p className="mt-1 text-n600">
          <StableText>{t("doneLead")}</StableText>
        </p>
        <dl className="mt-6 space-y-3 text-sm">
          {created.mint && (
            <div>
              <dt className="text-xs font-semibold text-n500">
                <StableText>{t("mint")}</StableText>
              </dt>
              <dd>
                <Address value={created.mint} />
              </dd>
            </div>
          )}
          <div>
            <dt className="text-xs font-semibold text-n500">
              <StableText>{t("transactions")}</StableText>
            </dt>
            <dd className="flex flex-wrap gap-3">
              {created.signatures.map((s) => (
                <Address key={s} value={s} kind="tx" />
              ))}
            </dd>
          </div>
        </dl>
        {created.mint && (
          <div className="mt-7 flex flex-wrap gap-3">
            <Button asChild>
              <Link href={`/issuer/series/${created.mint}`}>
                {t("openSeries")}
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href={`/bonds/${created.mint}`}>{t("publicPage")}</Link>
            </Button>
          </div>
        )}
        <p className="mt-4 text-xs text-n500">
          <StableText>{t("nextHint")}</StableText>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Stepper
        steps={[t("steps.terms"), t("steps.schedule"), t("steps.review")].map(
          (label, i) => ({
            key: String(i),
            label,
            state: i < step ? "done" : i === step ? "current" : "todo",
          }),
        )}
      />

      {step === 0 && (
        <form
          className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (valid) setStep(1);
          }}
        >
          <fieldset className="mb-6 rounded-card border border-n200 bg-n50/60 p-4">
            <legend className="px-1 text-sm font-semibold">
              {tk("title")}
            </legend>
            <TextField
              label={tk("ticker")}
              hint={tk("tickerHint")}
              value={kaseTicker}
              // KASE tickers are case-sensitive (TEBNb10): trim, never upper-case
              onChange={(e) => setKaseTicker(e.target.value.trim())}
              error={
                kaseError
                  ? tk.has(`errors.${kaseError}`)
                    ? tk(`errors.${kaseError}`)
                    : tk("errors.default")
                  : undefined
              }
              maxLength={12}
              // the button sits on the input's row, not at the label line (user report 2026-10-06)
              action={
                <Button
                  type="button"
                  variant="secondary"
                  loading={importing}
                  onClick={doImport}
                >
                  {tk("button")}
                </Button>
              }
            />
            {kase && (
              <p className="mt-2 flex flex-wrap items-center gap-2 text-xs text-g700">
                <Badge tone="success">{kase.ticker}</Badge>
                {tk("done", { ticker: kase.ticker, issuer: kase.issuer })}
              </p>
            )}
            <p className="mt-2 text-xs text-n500">
              <StableText>{tk("note")}</StableText>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-n200 pt-3">
              <TermsheetDialog onApply={applyTermsheet} />
              {termsheetApplied && (
                <span className="text-xs text-g700">{tts("applied")}</span>
              )}
            </div>
          </fieldset>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label={t("name")}
              hint={t("nameHint")}
              value={f.name}
              onChange={(e) => set("name")(e.target.value)}
              error={err("name")}
            />
            <TextField
              label="ISIN"
              hint={t("isinHint")}
              value={f.isin}
              onChange={(e) => set("isin")(e.target.value.toUpperCase())}
              error={err("isin")}
              maxLength={12}
            />
            <Select
              label={t("cash")}
              value={f.cash}
              onValueChange={set("cash")}
              options={assets.map((a) => ({
                value: a.key,
                label: `${a.symbol} · ${a.name}${a.kind === "wrapped_cbdc" ? " (SIMULATED)" : ""}`,
              }))}
            />
            <TextField
              label={t("face")}
              inputMode="decimal"
              value={f.face}
              onChange={(e) => set("face")(e.target.value)}
              suffix={asset ? cashSuffix(asset) : undefined}
              error={err("face")}
            />
            {/* rate, frequency and day count read as one decision: one row of three */}
            <div className="grid gap-5 sm:col-span-2 sm:grid-cols-3">
              <TextField
                label={t("rate")}
                inputMode="decimal"
                value={f.rate}
                onChange={(e) => set("rate")(e.target.value)}
                suffix="%"
                error={err("rate")}
              />
              <Select
                label={t("frequency")}
                value={f.frequency}
                onValueChange={set("frequency")}
                options={[
                  { value: "1", label: t("freq.1") },
                  { value: "2", label: t("freq.2") },
                  { value: "4", label: t("freq.4") },
                  { value: "12", label: t("freq.12") },
                ]}
              />
              <Select
                label={t("dayCount")}
                value={f.dayCount}
                onValueChange={set("dayCount")}
                options={[
                  { value: "THIRTY_360", label: "30E/360" },
                  { value: "ACT_365", label: "ACT/365" },
                ]}
              />
            </div>
            <TextField
              label={t("issueDate")}
              type="date"
              value={f.issueDate}
              onChange={(e) => set("issueDate")(e.target.value)}
              error={err("issueDate")}
            />
            <TextField
              label={t("maturityDate")}
              type="date"
              value={f.maturityDate}
              onChange={(e) => set("maturityDate")(e.target.value)}
              error={err("maturityDate")}
            />
          </div>
          <p className="mt-5 text-xs text-n500">
            <StableText>{t("meetingDefaults")}</StableText>
          </p>
          <div className="mt-6 flex justify-end">
            <Button type="submit">{t("next")}</Button>
          </div>
        </form>
      )}

      {step === 1 && (
        <div className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8">
          <h2 className="text-lg font-bold">
            <StableText>
              {t("scheduleTitle", { count: rows.length })}
            </StableText>
          </h2>
          <p className="mt-1 text-sm text-n600">
            <StableText>{t("scheduleLead")}</StableText>
          </p>
          <div className="mt-5 overflow-hidden rounded-card border border-n200">
            <table className="w-full text-sm">
              <thead className="bg-n50 text-left text-[11px] font-bold tracking-[0.06em] text-n500 uppercase">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">{t("period")}</th>
                  <th className="px-4 py-2.5 text-right">{t("perBond")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.n} className="border-t border-n200">
                    <td className="num px-4 py-2.5">{r.n}</td>
                    <td className="num px-4 py-2.5">
                      {r.periodStart} – {r.periodEnd}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Amount
                        minor={r.perUnitMinor}
                        currency={currency}
                        locale={locale}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-n200 bg-n50 font-semibold">
                  <td className="px-4 py-2.5" colSpan={2}>
                    {t("totalPerBond")}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Amount
                      minor={totalCoupons}
                      currency={currency}
                      locale={locale}
                    />
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {kase && rateBps !== undefined && (
            <div className="mt-6 rounded-card border border-warn-bd p-4">
              <h3 className="text-sm font-bold">
                {tc("title", { ticker: kase.ticker })}
              </h3>
              <p className="mt-1 text-xs text-n600">{tc("lead")}</p>
              <div className="mt-3 max-h-72 overflow-auto rounded-btn border border-n200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-n50 text-left font-bold tracking-wide text-n500 uppercase">
                    <tr>
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">{tc("kasePeriod")}</th>
                      <th className="px-3 py-2">{tc("previewPeriod")}</th>
                      <th className="px-3 py-2 text-right">{tc("status")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {compareKaseSchedule(kase.schedule, rows, rateBps).map(
                      (r) => (
                        <tr
                          key={r.n}
                          className={`border-t border-n200 ${r.mismatch ? "bg-warn-bg font-semibold text-warn-fg" : ""}`}
                        >
                          <td className="num px-3 py-2">{r.n}</td>
                          <td className="num px-3 py-2">
                            {r.kase
                              ? `${r.kase.start} – ${r.kase.end} · ${(r.kase.rate / 100).toFixed(2)}%`
                              : "—"}
                          </td>
                          <td className="num px-3 py-2">
                            {r.preview
                              ? `${r.preview.periodStart} – ${r.preview.periodEnd}`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {r.mismatch ? tc("mismatch") : tc("match")}
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-n500">{tc("legend")}</p>
            </div>
          )}
          <div className="mt-6 flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(0)}>
              {t("back")}
            </Button>
            <Button onClick={() => setStep(2)}>{t("next")}</Button>
          </div>
        </div>
      )}

      {step === 2 && faceMinor !== undefined && rateBps !== undefined && (
        <div className="rounded-hero border border-n200 bg-n0 p-6 sm:p-8">
          <h2 className="text-lg font-bold">
            <StableText>{t("reviewTitle")}</StableText>
          </h2>
          <dl className="mt-5 grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            {(
              [
                [t("name"), f.name],
                ["ISIN", f.isin],
                [
                  t("face"),
                  <Amount
                    key="f"
                    minor={faceMinor}
                    currency={currency}
                    locale={locale}
                  />,
                ],
                [
                  t("rate"),
                  `${(rateBps / 100).toFixed(2)}% · ${t(`freq.${freq}`)}`,
                ],
                [
                  t("dayCount"),
                  f.dayCount === "THIRTY_360" ? "30E/360" : "ACT/365",
                ],
                [t("term"), `${f.issueDate} – ${f.maturityDate}`],
                [t("coupons"), String(rows.length)],
                [t("meetings"), t("meetingValues")],
              ] as const
            ).map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-n500">{k}</dt>
                <dd className="mt-0.5 text-n900">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-6 rounded-btn bg-p50 px-4 py-3 text-sm text-p700">
            <StableText>{t("onchainNote")}</StableText>
          </p>
          <div className="mt-6 flex justify-between gap-3">
            <Button variant="ghost" onClick={() => setStep(1)} disabled={busy}>
              {t("back")}
            </Button>
            <Button size="lg" loading={busy} onClick={issue}>
              {t("issue")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
