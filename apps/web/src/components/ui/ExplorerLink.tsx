// Minimal stub — replaced by the full UI kit in task 050 (keep props stable).
import { shortKey } from "@/lib/format";

export function ExplorerLink({
  value,
  kind,
  label,
}: {
  value: string;
  kind: "address" | "tx";
  label?: string;
}) {
  const href = `https://explorer.solana.com/${kind}/${value}?cluster=devnet`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={value}
      className="font-mono text-sky-400 underline decoration-dotted underline-offset-2 hover:text-sky-300"
    >
      {label ?? shortKey(value)}
    </a>
  );
}
