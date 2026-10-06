/**
 * Solana wallet catalog and the connect rules (spec §5.7): which wallets are installed, what the connect button
 * does, where to install one, and how to open this page inside a mobile wallet's browser.
 */

export type WalletState =
  "Installed" | "Loadable" | "NotDetected" | "Unsupported";

/** Popular Solana wallets we suggest when none (or not this one) is installed. */
export const CATALOG = [
  {
    name: "Phantom",
    install: "https://phantom.com/download",
    browse: (url: string, ref: string) =>
      `https://phantom.app/ul/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  },
  {
    name: "Solflare",
    install: "https://solflare.com/download",
    browse: (url: string, ref: string) =>
      `https://solflare.com/ul/v1/browse/${encodeURIComponent(url)}?ref=${encodeURIComponent(ref)}`,
  },
  {
    name: "Backpack",
    install: "https://backpack.app/download",
    browse: undefined,
  },
] as const;

export type CatalogWallet = (typeof CATALOG)[number];

/** Installed (browser extension / in-app browser) and loadable (e.g. Android Mobile Wallet Adapter) wallets. */
export function usable<T extends { readyState: WalletState }>(
  wallets: T[],
): T[] {
  return wallets.filter(
    (w) => w.readyState === "Installed" || w.readyState === "Loadable",
  );
}

/** What "Connect wallet" does: connect the only wallet directly, let the user pick, or explain how to get one. */
export function connectPlan(installed: number): "direct" | "pick" | "none" {
  return installed === 1 ? "direct" : installed > 1 ? "pick" : "none";
}

/** Catalog wallets that are not installed (offered as installs under the picker). */
export function toInstall(installedNames: string[]): CatalogWallet[] {
  const have = new Set(installedNames.map((n) => n.toLowerCase()));
  return CATALOG.filter((c) => !have.has(c.name.toLowerCase()));
}

/** "DL8G…aJEo" */
export const shortAddress = (a: string) =>
  a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
