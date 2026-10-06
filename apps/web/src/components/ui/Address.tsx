"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { explorerHref, useNetwork } from "@/components/network/NetworkContext";

/** Short base58 with a devnet explorer link and a copy button. */
export function Address({
  value,
  kind = "address",
  label,
}: {
  value: string;
  kind?: "address" | "tx";
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const network = useNetwork();
  const t = useTranslations("common");
  const short =
    value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <a
        href={explorerHref(kind, value, network.explorerCluster)}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="num truncate font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
      >
        {label ?? short}
      </a>
      <button
        type="button"
        aria-label={copied ? t("copied") : t("copy")}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        className="-m-1 grid size-8 shrink-0 place-items-center rounded-btn text-xs text-n500 transition-colors hover:bg-n100 hover:text-n900"
      >
        {copied ? <span className="animate-qp-pop text-g600">✓</span> : "⧉"}
      </button>
    </span>
  );
}
