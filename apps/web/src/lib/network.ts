import { cookies } from "next/headers";
import { cache } from "react";
import { MOCK_ENABLED } from "@/lib/api";
import { apiBase } from "@/lib/session";

/** GET /network: the cluster this deployment serves (platform v2 §5.1). */
export type NetworkInfo = {
  network: "devnet" | "mainnet-beta";
  programId: string;
  explorerCluster: string;
  mainnet: boolean;
  demoLogin: boolean;
};

const DEVNET: NetworkInfo = {
  network: "devnet",
  programId: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
  explorerCluster: "devnet",
  mainnet: false,
  demoLogin: true,
};

/** Server-side, once per request; falls back to devnet when the API is unreachable (never claims mainnet). */
export const getNetwork = cache(async (): Promise<NetworkInfo> => {
  if (MOCK_ENABLED) {
    // e2e can preview the mainnet UI in mock mode: cookie qupon_mock_network=mainnet-beta
    const c = (await cookies()).get("qupon_mock_network")?.value;
    return c === "mainnet-beta"
      ? {
          ...DEVNET,
          network: "mainnet-beta",
          explorerCluster: "",
          mainnet: true,
          demoLogin: false,
        }
      : DEVNET;
  }
  const res = await fetch(`${apiBase()}/network`, {
    next: { revalidate: 60 },
  }).catch(() => null);
  if (!res?.ok) return DEVNET;
  return (await res.json()) as NetworkInfo;
});
