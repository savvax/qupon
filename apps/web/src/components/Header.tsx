"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export function Header() {
  return (
    <header className="mb-6 border-b border-neutral-800">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div>
          <div className="text-sm font-semibold tracking-wider">
            QUPON · REGISTRAR CONSOLE
          </div>
          <div className="text-xs text-neutral-500">
            corporate actions for tokenized bonds · solana devnet
          </div>
        </div>
        <WalletMultiButton className="!h-8 !rounded !text-xs" />
      </div>
    </header>
  );
}
