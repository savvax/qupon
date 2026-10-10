import type { MockHandler } from "./types";

const SIG =
  "MockBankCnfSig1111111111111111111111111111111111111111111111111111111111";

/**
 * Plan 15 D6: the confirm-bank write. The bank transfer itself is SIMULATED, but the route is real —
 * the mock answers with the ConfirmBankResponse shape so the toast links the tx (AGENTS.md).
 */
export const handlers: MockHandler[] = [
  {
    method: "POST",
    path: /^\/actions\/([A-Za-z0-9_-]{1,50})\/confirm-bank$/,
    reply: () => ({
      ok: true,
      signature: SIG,
      explorerUrl: `https://explorer.solana.com/tx/${SIG}?cluster=devnet`,
    }),
  },
];
