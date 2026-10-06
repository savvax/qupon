"use client";

import {
  ConnectionProvider,
  WalletProvider,
} from "@solana/wallet-adapter-react";
import type { ReactNode } from "react";
import { MotionProvider } from "@/components/motion/MotionProvider";
import { MainnetConfirmHost } from "@/components/network/MainnetConfirm";
import { NetworkProvider } from "@/components/network/NetworkContext";
import type { NetworkInfo } from "@/lib/network";
import { Toaster } from "@/components/ui/Toaster";
import { WalletUX, reportWalletError } from "@/components/wallet/WalletUX";

// Devnet endpoint; override with NEXT_PUBLIC_RPC_URL. NEXT_PUBLIC_* is inlined into the browser bundle, so use a
// keyless or domain-restricted endpoint here — never the keyed RPC_URL from .env.
const ENDPOINT =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// No explicit adapters needed: Phantom, Backpack and Solflare all implement
// the Wallet Standard and are auto-detected by WalletProvider.
export default function Providers({
  children,
  network,
}: {
  children: ReactNode;
  network: NetworkInfo;
}) {
  return (
    <NetworkProvider value={network}>
      <ConnectionProvider endpoint={ENDPOINT}>
        <WalletProvider wallets={[]} autoConnect onError={reportWalletError}>
          {/* MotionProvider wraps WalletUX: the wallet dialog animates with motion's LazyMotion (strict). */}
          <MotionProvider>
            <WalletUX>
              {children}
              <Toaster />
              <MainnetConfirmHost />
            </WalletUX>
          </MotionProvider>
        </WalletProvider>
      </ConnectionProvider>
    </NetworkProvider>
  );
}
