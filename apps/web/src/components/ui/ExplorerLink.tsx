"use client";

import { useState } from "react";
import { shortKey } from "@/lib/format";

/** Explorer link with a copy button for the full tx signature / address. */
export function ExplorerLink({
  value,
  kind,
  label,
}: {
  value: string;
  kind: "address" | "tx";
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const href = `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;
  const copy = () => {
    navigator.clipboard.writeText(value).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className="inline-flex items-center gap-1">
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        title={value}
        className="font-mono text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300"
      >
        {label ?? shortKey(value)}
      </a>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy ${kind}`}
        title={value}
        className="rounded border border-neutral-700 px-1 text-[10px] leading-4 text-neutral-400 hover:border-neutral-500 hover:text-neutral-200"
      >
        {copied ? "✓" : "⧉"}
      </button>
    </span>
  );
}
