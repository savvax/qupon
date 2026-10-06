import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "./NetworkBadge";

/** Server-rendered items of the cabinet top bar: network, the Solana wallet (spec §5.7); the notification bell joins here. */
export function TopbarExtras() {
  return (
    <>
      <NetworkBadge className="hidden sm:inline-flex" />
      <WalletButton compact />
    </>
  );
}
