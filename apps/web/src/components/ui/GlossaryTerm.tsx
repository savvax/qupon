"use client";

import { useTranslations } from "next-intl";
import { type CSSProperties, type ReactNode, useId } from "react";
import { StableLabel } from "@/components/i18n/StableLabel";

export const GLOSSARY = [
  "recordDate",
  "snapshot",
  "escrow",
  "entitlement",
  "accrued",
  "cleanDirty",
  "ytm",
  "permissionless",
  "transferHook",
  "default",
  "cure",
  "taxVault",
  "payingAgent",
  "seev031",
  "seev036",
  "demoClock",
  "dayCount",
] as const;
export type GlossaryKey = (typeof GLOSSARY)[number];

/**
 * A term with a dotted underline; click, tap or Enter opens its plain-language definition (native popover: Esc
 * and a tap outside close it, no JS positioning). Text defaults to the glossary's own term.
 */
export function GlossaryTerm({
  term,
  children,
  stable = false,
}: {
  term: GlossaryKey;
  children?: ReactNode;
  /** Reserve the width of the longer EN/RU term (standalone chips; not inside running text). */
  stable?: boolean;
}) {
  const t = useTranslations("kit.glossary");
  const id = `qp-g${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className="qp-term inline font-[inherit] text-[length:inherit]"
        style={{ anchorName: `--${id}` } as CSSProperties}
      >
        {children ??
          (stable ? (
            <StableLabel align="start">{t(`${term}.term`)}</StableLabel>
          ) : (
            t(`${term}.term`)
          ))}
      </button>
      <span
        id={id}
        popover="auto"
        className="qp-gloss"
        style={{ positionAnchor: `--${id}` } as CSSProperties}
      >
        <span className="block font-bold text-n900">{t(`${term}.term`)}</span>
        <span className="mt-1 block text-n700">{t(`${term}.def`)}</span>
      </span>
    </>
  );
}
