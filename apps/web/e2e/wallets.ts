import type { Page } from "@playwright/test";
import { getBase58Encoder } from "@solana/kit";

/** Test addresses (the brief's investors) used as the fake wallets' accounts. */
export const ADDRESSES = [
  "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
  "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
] as const;

/**
 * Register fake Wallet Standard wallets before the app loads (as browser extensions do), so the wallet UX sees
 * 0, 1 or several installed wallets. `window.__rejectConnect = true` makes connect() throw like a user rejection.
 */
export async function injectWallets(page: Page, names: string[]) {
  const wallets = names.map((name, i) => {
    const address: string = ADDRESSES[i % ADDRESSES.length] ?? ADDRESSES[0];
    return {
      name,
      address,
      bytes: Array.from(getBase58Encoder().encode(address)),
    };
  });
  await page.addInitScript((defs) => {
    const icon =
      "data:image/svg+xml;base64," +
      btoa(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#5b3fd6"/></svg>',
      );
    for (const d of defs) {
      let accounts: unknown[] = [];
      const listeners: Record<string, ((p: unknown) => void)[]> = {};
      const chains = ["solana:devnet", "solana:mainnet"];
      const account = {
        address: d.address,
        publicKey: Uint8Array.from(d.bytes),
        chains,
        features: ["solana:signTransaction", "solana:signMessage"],
      };
      const wallet = {
        version: "1.0.0",
        name: d.name,
        icon,
        chains,
        get accounts() {
          return accounts;
        },
        features: {
          "standard:connect": {
            version: "1.0.0",
            connect: async () => {
              if (
                (window as unknown as { __rejectConnect?: boolean })
                  .__rejectConnect
              )
                throw new Error("User rejected the request.");
              accounts = [account];
              for (const l of listeners.change ?? []) l({ accounts });
              return { accounts };
            },
          },
          "standard:disconnect": {
            version: "1.0.0",
            disconnect: async () => {
              accounts = [];
              for (const l of listeners.change ?? []) l({ accounts });
            },
          },
          "standard:events": {
            version: "1.0.0",
            on: (event: string, listener: (p: unknown) => void) => {
              (listeners[event] ??= []).push(listener);
              return () => {
                listeners[event] = (listeners[event] ?? []).filter(
                  (l) => l !== listener,
                );
              };
            },
          },
          "solana:signTransaction": {
            version: "1.0.0",
            supportedTransactionVersions: ["legacy", 0],
            signTransaction: async () => {
              throw new Error("signing is not part of these tests");
            },
          },
          "solana:signMessage": {
            version: "1.0.0",
            signMessage: async () => [
              {
                signedMessage: new Uint8Array(),
                signature: new Uint8Array(64),
              },
            ],
          },
        },
      };
      const register = ({ register }: { register: (w: unknown) => void }) =>
        register(wallet);
      window.addEventListener("wallet-standard:app-ready", (e) =>
        register((e as CustomEvent).detail),
      );
      window.dispatchEvent(
        new CustomEvent("wallet-standard:register-wallet", {
          detail: register,
        }),
      );
    }
  }, wallets);
}
