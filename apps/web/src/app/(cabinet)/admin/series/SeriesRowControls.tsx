"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { cx } from "@/lib/ui/cx";
import { boSend } from "@/lib/boClient";
import { useRunWrite } from "@/lib/useRunWrite";

export type OrgOption = { id: number; name: string };

/** Accessible toggle switch (native button, no dependency): role="switch" + aria-checked. */
function Switch({
  checked,
  label,
  onToggle,
  disabled,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        "inline-flex h-6 w-11 shrink-0 items-start rounded-full border p-0.5 transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-p600",
        checked ? "border-g600 bg-g600" : "border-n400 bg-n200",
        disabled && "cursor-not-allowed opacity-50",
      )}
    >
      <span
        aria-hidden
        className={cx(
          "size-4.5 rounded-full bg-white shadow transition-transform",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}

/** Task 91541: per-series autopilot scenario. On (default) = the autopilot funds the escrow;
 * off = the coupon defaults after its grace day (the default/cure demo). The label is hidden
 * on lg+ where the table column header names it. */
export function SeriesAutopilot({
  mint,
  noAutofund,
}: {
  mint: string;
  noAutofund: boolean;
}) {
  const t = useTranslations("admin.series");
  const runWrite = useRunWrite();
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-n500 lg:hidden">
        {t("colAutopilot")}
      </span>
      <span className="flex items-center gap-2 text-xs font-semibold">
        <Switch
          checked={!noAutofund}
          label={t("colAutopilot")}
          onToggle={() =>
            void runWrite({
              pending: t("toggleAutopilotPending"),
              success: () => t("toggleAutopilotSaved"),
              call: () =>
                boSend("PATCH", `admin/series/${mint}`, {
                  noAutofund: !noAutofund,
                }),
            }).then((r) => {
              if (r) router.refresh();
            })
          }
        />
        <span className={noAutofund ? "text-n400" : "text-g700"}>
          {noAutofund ? t("autopilotOff") : t("autopilotOn")}
        </span>
      </span>
      <p className="max-w-[22rem] text-[11px] text-n500">
        {t("autopilotHint")}
      </p>
    </div>
  );
}

/** Per-series admin controls (platform v2 §5.2): visibility, featuring, KASE ticker link,
 * owning organisation. Each change PATCHes /admin/series/{mint} and refreshes the table. */
export function SeriesRowControls({
  mint,
  hidden,
  featured,
  kaseTicker,
  orgId,
  orgs,
}: {
  mint: string;
  hidden: boolean;
  featured: boolean;
  kaseTicker: string;
  orgId: number | null;
  orgs: OrgOption[];
}) {
  const t = useTranslations("admin.series");
  const runWrite = useRunWrite();
  const router = useRouter();
  const [ticker, setTicker] = useState(kaseTicker);
  const [org, setOrg] = useState(orgId ? String(orgId) : "0");
  const [error, setError] = useState("");

  const patch = (
    body: Record<string, unknown>,
    pending: string,
    success: string,
  ) =>
    runWrite({
      pending,
      success: () => success,
      call: () => boSend("PATCH", `admin/series/${mint}`, body),
    }).then((r) => {
      if (r) router.refresh();
      return r;
    });

  const save = () => {
    if (ticker !== "" && !/^[A-Za-z0-9]{2,12}$/.test(ticker)) {
      setError(t("kaseTickerError"));
      return;
    }
    setError("");
    void patch(
      { kaseTicker: ticker, orgId: Number(org) },
      t("saving"),
      t("saved"),
    );
  };

  return (
    <div className="flex w-full max-w-[22rem] flex-col gap-2 max-sm:max-w-none">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Switch
            checked={!hidden}
            label={hidden ? t("showSeries") : t("hideSeries")}
            onToggle={() =>
              void patch(
                { hidden: !hidden },
                t("toggleHiddenPending"),
                t("toggleHiddenSaved"),
              )
            }
          />
          <span className={hidden ? "text-n400" : "text-g700"}>
            {hidden ? t("hidden") : t("visible")}
          </span>
        </span>
        <span className="flex items-center gap-2 text-xs font-semibold">
          <Switch
            checked={featured}
            label={t("featuredLabel")}
            onToggle={() =>
              void patch(
                { featured: !featured },
                t("toggleFeaturedPending"),
                t("toggleFeaturedSaved"),
              )
            }
          />
          <span className={featured ? "text-g700" : "text-n400"}>
            {featured ? t("featured") : t("notFeatured")}
          </span>
        </span>
      </div>
      {/* phones: ticker + organisation share a row, Save takes the full width below */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-24 shrink-0">
          <label
            htmlFor={`kase-${mint}`}
            className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-n500"
          >
            {t("kaseTicker")}
          </label>
          <input
            id={`kase-${mint}`}
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="TEBN"
            aria-invalid={error ? true : undefined}
            className={cx(
              "h-9 w-full rounded-btn border bg-n0 px-2 text-sm",
              error ? "border-err-bd" : "border-n300 focus:border-g600",
            )}
          />
        </div>
        <div className="min-w-[10rem] flex-1">
          <Select
            label={t("organisation")}
            value={org}
            onValueChange={setOrg}
            options={[
              { value: "0", label: t("noOrg") },
              ...orgs.map((o) => ({ value: String(o.id), label: o.name })),
            ]}
          />
        </div>
        <Button
          size="sm"
          variant="secondary"
          className="max-sm:h-9 max-sm:w-full"
          onClick={() => void save()}
        >
          {t("save")}
        </Button>
      </div>
      {error && <p className="text-xs text-err-fg">{error}</p>}
    </div>
  );
}
