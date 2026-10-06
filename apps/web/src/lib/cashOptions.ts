import { boFetch } from "@/lib/bo";
import type { CashOption, PublicAsset } from "@/lib/cashAssets";

/** Server-side: the wizard's cash options from GET /assets, or the legacy tKZT/USDC aliases if unreachable. */
const BUILT_IN: CashOption[] = [
  {
    key: "tkzt",
    symbol: "tKZT",
    name: "Test tenge",
    decimals: 2,
    kind: "test",
    alias: "tkzt",
  },
  {
    key: "usdc",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    kind: "stablecoin",
    alias: "usdc",
  },
];

export async function cashOptions(): Promise<CashOption[]> {
  const assets = await boFetch<PublicAsset[]>("/assets").catch(() => null);
  if (!assets?.length) return BUILT_IN;
  return assets.map((a) => ({
    key: a.mint,
    symbol: a.symbol,
    name: a.name,
    decimals: a.decimals,
    kind: a.kind,
    mint: a.mint,
  }));
}
