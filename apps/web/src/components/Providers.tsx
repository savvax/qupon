"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui/Toast";
import "@solana/wallet-adapter-react-ui/styles.css";

// Devnet endpoint; override with NEXT_PUBLIC_RPC_URL (e.g. Helius).
const ENDPOINT = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

// No explicit adapters needed: Phantom, Backpack and Solflare all implement
// the Wallet Standard and are auto-detected by WalletProvider.
export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ConnectionProvider endpoint={ENDPOINT}>
      <WalletProvider wallets={[]} autoConnect>
        <WalletModalProvider>
          <ToastProvider>{children}</ToastProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
