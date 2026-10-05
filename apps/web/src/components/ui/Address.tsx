"use client";

import { useState } from "react";

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
  const short =
    value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1">
      <a
        href={`https://explorer.solana.com/${kind}/${value}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="num truncate font-semibold text-g700 underline decoration-g300 underline-offset-2 hover:decoration-g600"
      >
        {label ?? short}
      </a>
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          });
        }}
        className="grid size-6 shrink-0 place-items-center rounded-sm text-xs text-n500 hover:bg-n100 hover:text-n900"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
