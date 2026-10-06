import { WalletButton } from "@/components/wallet/WalletButton";
import { NetworkBadge } from "./NetworkBadge";

/** Server-rendered items of the cabinet top bar: network, the Solana wallet (spec §5.7); the bell sits in CabinetShell. */
export function TopbarExtras() {
  return (
    <>
      {/* a wrapper hides it: the badge's own inline-flex would beat a "hidden" passed in */}
      <span className="hidden sm:contents">
        <NetworkBadge />
      </span>
      <WalletButton compact />
    </>
  );
}
