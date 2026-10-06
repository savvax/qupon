"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/Button";

/** The browser's own print dialog is the PDF engine (spec §5.4): window.print() + @media print styles. */
export function PrintButton() {
  const t = useTranslations("reports.print");
  return <Button onClick={() => window.print()}>{t("save")}</Button>;
}
