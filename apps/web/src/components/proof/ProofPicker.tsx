"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { shortKey } from "@/lib/format";
import { DEMO_SERIES } from "@/lib/proof/demoSeries";

/**
 * "Paste a bond mint" + the demo series. The static export pre-renders /proof/<mint>/ only for known mints, so a
 * pasted one goes to /proof/?mint=… there.
 */
export function ProofPicker({
  staticExport = false,
}: {
  staticExport?: boolean;
}) {
  const t = useTranslations("proof.pick");
  const [mint, setMint] = useState("");
  const href = (m: string) =>
    staticExport
      ? `/proof/?mint=${encodeURIComponent(m)}`
      : `/proof/${encodeURIComponent(m)}`;
  return (
    <div className="mx-auto w-full max-w-[720px] px-4 py-12 sm:px-6 sm:py-16">
      <h1 className="text-title font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-2 max-w-[62ch] text-base text-n700">{t("text")}</p>
      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (mint.trim()) window.location.assign(href(mint.trim()));
        }}
      >
        <label className="sr-only" htmlFor="proof-mint">
          {t("label")}
        </label>
        <input
          id="proof-mint"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
          placeholder={t("label")}
          spellCheck={false}
          className="num h-11 min-w-0 rounded-btn border border-n300 bg-n0 px-3 text-sm outline-none focus:border-g600 sm:flex-1"
        />
        <Button type="submit" className="h-11">
          {t("go")}
        </Button>
      </form>
      <h2 className="mt-10 text-sm font-bold text-n900">{t("demos")}</h2>
      <ul className="mt-2 divide-y divide-n100 rounded-card border border-n200 bg-n0">
        {DEMO_SERIES.map((d) => (
          <li key={d.mint}>
            <a
              href={staticExport ? `/proof/${d.mint}/` : href(d.mint)}
              className="flex items-center justify-between gap-3 p-4 hover:bg-n50"
            >
              <span className="min-w-0">
                <span className="block text-sm font-bold text-n900">
                  {d.ticker}{" "}
                  <span className="num font-semibold text-g700">
                    {shortKey(d.mint, 4, 4)}
                  </span>
                </span>
                <span className="mt-0.5 block text-sm text-n600">
                  {t(d.key)}
                </span>
              </span>
              <span aria-hidden className="text-n500">
                ›
              </span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
