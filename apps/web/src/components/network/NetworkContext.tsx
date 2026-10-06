"use client";

import { type ReactNode, createContext, useContext } from "react";
import type { NetworkInfo } from "@/lib/network";

const DEVNET: NetworkInfo = {
  network: "devnet",
  programId: "",
  explorerCluster: "devnet",
  mainnet: false,
  demoLogin: true,
};

const Ctx = createContext<NetworkInfo>(DEVNET);

/** The deployment's network (from GET /network, read once in the root layout) for client components. */
export function NetworkProvider({
  value,
  children,
}: {
  value: NetworkInfo;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNetwork = () => useContext(Ctx);

/** Explorer link for this network: devnet links carry ?cluster=devnet, mainnet links none. */
export function explorerHref(
  kind: "address" | "tx",
  id: string,
  cluster: string,
): string {
  const base = `https://explorer.solana.com/${kind}/${id}`;
  return cluster ? `${base}?cluster=${cluster}` : base;
}
