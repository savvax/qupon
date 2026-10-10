import { getTranslations } from "next-intl/server";
import { getNetwork } from "@/lib/network";
import { cx } from "@/lib/ui/cx";

/** Which cluster this deployment serves: neutral Devnet (green dot = the trust colour), red Mainnet (§4). */
export async function NetworkBadge({ className }: { className?: string }) {
  const n = await getNetwork();
  const t = await getTranslations("network.badge");
  return (
    <span
      title={t(n.mainnet ? "mainnetHint" : "devnetHint")}
      data-network={n.network}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold",
        // opus pre-flight #17: amber is the *simulated* colour; devnet reads neutral with the green trust dot
        n.mainnet ? "bg-err-bg text-err-fg" : "bg-n100 text-n700",
        className,
      )}
    >
      <span
        aria-hidden
        className={cx(
          "size-1.5 rounded-full",
          n.mainnet ? "bg-err-fg" : "bg-g600",
        )}
      />
      {t(n.network)}
    </span>
  );
}
