import type { MockHandler } from "./types";

/**
 * Mock-mode investor onboarding (task 808): the checklist of the `mock:member`
 * account (one linked wallet from ./account, KYC not yet approved) and the
 * devnet faucet write (task 603's POST /me/faucet) that closes its test-cash
 * step. In-memory and mutable so the e2e sees the row flip after the click.
 */

const state = { testCashReceived: false };

// testAssets of config/devnet.json joined with the enabled registry — exactly
// what internal/api/onboarding.go answers (USDC is not a test asset).
const faucetAssets = [
  {
    mint: "7H3MbktQifAeYqKS44ar9ck1c4kQZ3Sgj36bmQzm2atq",
    symbol: "KZTE-dev",
    name: "Evo tenge (devnet stand-in)",
    decimals: 2,
    kind: "stablecoin",
  },
  {
    mint: "WsSWxpZXuuDcBmymLitFpvfEWWebiBUXBRNQRFBT29k",
    symbol: "dKZT",
    name: "Digital tenge (custodian-wrapped, SIMULATED)",
    decimals: 2,
    kind: "wrapped_cbdc",
  },
];

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/me\/onboarding$/,
    reply: () => ({
      checklist: {
        account: true,
        walletLinked: true,
        kycApproved: false,
        testCashReceived: state.testCashReceived,
        subscribed: false,
      },
      faucetAssets,
    }),
  },
  // POST /me/faucet {mint} — mints 100,000 major units to the first wallet.
  {
    method: "POST",
    path: /^\/me\/faucet$/,
    reply: (_m, body) => {
      const mint = String((body as { mint?: string }).mint ?? "");
      const a = faucetAssets.find((x) => x.mint === mint);
      if (!a)
        return {
          code: "asset_not_found",
          message: "mint is not a test asset of this network",
        };
      state.testCashReceived = true;
      return {
        ok: true,
        symbol: a.symbol,
        amount: 100_000 * 10 ** a.decimals,
        signature:
          "MockFaucetSig1111111111111111111111111111111111111111111111111111111",
        ata: "MockAta1111111111111111111111111111111111111111111111111",
        explorerUrl:
          "https://explorer.solana.com/tx/MockFaucetSig1111111111111111111111111111111111111111111111111111111?cluster=devnet",
      };
    },
  },
];
