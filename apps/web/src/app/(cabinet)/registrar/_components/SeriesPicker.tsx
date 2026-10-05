"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select";

/** Series filter for the investors page: navigates with ?mint= (server-rendered reads). */
export function SeriesPicker({
  mint,
  series,
}: {
  mint: string;
  series: { mint: string; ticker: string }[];
}) {
  const t = useTranslations("registrar.investors");
  const router = useRouter();
  return (
    <div className="w-full max-w-xs">
      <Select
        label={t("series")}
        value={mint}
        onValueChange={(m) => router.push(`/registrar/investors?mint=${m}`)}
        options={series.map((s) => ({ value: s.mint, label: s.ticker }))}
      />
    </div>
  );
}
