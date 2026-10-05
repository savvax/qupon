"use client";

import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import Link from "next/link";

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
        <div className="flex items-center gap-4">
          <Link
            href="/portal"
            className="text-xs text-neutral-500 hover:text-sky-300"
          >
            portal
          </Link>
          <Link
            href="/kitchen-sink"
            className="text-xs text-neutral-500 hover:text-sky-300"
          >
            ui kit
          </Link>
          <WalletMultiButton className="!h-8 !rounded !text-xs" />
        </div>
      </div>
    </header>
  );
}
