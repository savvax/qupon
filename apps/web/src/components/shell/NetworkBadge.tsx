import { getTranslations } from "next-intl/server";
import { getNetwork } from "@/lib/network";
import { cx } from "@/lib/ui/cx";

/** Which cluster this deployment serves: amber Devnet, red Mainnet (platform v2 §5.1). */
export async function NetworkBadge({ className }: { className?: string }) {
  const n = await getNetwork();
  const t = await getTranslations("network.badge");
  return (
    <span
      title={t(n.mainnet ? "mainnetHint" : "devnetHint")}
      data-network={n.network}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
        n.mainnet ? "bg-err-bg text-err-fg" : "bg-warn-bg text-warn-fg",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "size-1.5 rounded-full",
          n.mainnet ? "bg-err-fg" : "bg-warn-fg",
        )}
      />
      {t(n.network)}
    </span>
  );
}
