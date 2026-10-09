import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { StableLabel } from "@/components/i18n/StableLabel";
import { cx } from "@/lib/ui/cx";

export type Provenance =
  | "onchain"
  | "verified"
  | "simulated"
  | "demo"
  | "roadmap";

const STYLE: Record<Provenance, string> = {
  onchain: "border-g200 bg-g50 text-g700",
  verified: "border-g600 bg-g600 text-white",
  simulated: "qp-hatch border-dashed border-warn-bd bg-warn-bg text-warn-fg",
  demo: "border-demo-bd bg-demo-bg text-demo-fg",
  roadmap: "border-dashed border-n300 bg-n0 text-n600",
};

/** The glyph says what kind of claim this is: a check (proven), a dash (stand-in), a clock (accelerated time). */
function Glyph({ kind }: { kind: Provenance }) {
  const d =
    kind === "onchain" || kind === "verified"
      ? "m3.5 8.5 3 3 6-7"
      : kind === "demo"
        ? "M8 4.5V8l2.5 1.5M14 8A6 6 0 1 1 2 8a6 6 0 0 1 12 0"
        : kind === "simulated"
          ? "M4 8h8"
          : "M8 3v10M3 8h10";
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden
      className="size-3 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

/**
 * Where a fact comes from, next to the fact: proven on-chain (optionally linking to the transaction), simulated,
 * demo clock or roadmap. The hover title explains the claim in one sentence.
 */
export function ProvenanceChip({
  kind,
  href,
  children,
  className,
}: {
  kind: Provenance;
  /** Explorer link (on-chain / verified): the chip becomes the link. */
  href?: string;
  /** Label override; defaults to kit.prov.<kind>. */
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("kit.prov");
  const cls = cx(
    "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-micro font-bold whitespace-nowrap",
    STYLE[kind],
    href && "underline-offset-2 hover:underline",
    className,
  );
  const body = (
    <>
      <Glyph kind={kind} />
      {/* default labels reserve the longer locale's width: switching EN ↔ RU never moves what follows */}
      {children ?? <StableLabel align="start">{t(kind)}</StableLabel>}
    </>
  );
  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={t(`${kind}Hint`)}
      className={cls}
    >
      {body}
    </a>
  ) : (
    <span title={t(`${kind}Hint`)} className={cls}>
      {body}
    </span>
  );
}
