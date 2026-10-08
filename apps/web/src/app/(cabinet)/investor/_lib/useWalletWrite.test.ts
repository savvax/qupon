import { describe, expect, it } from "vitest";
import type { Signature } from "@solana/kit";
import { walletLegSent } from "./useWalletWrite";

const sig = "sig" as Signature;

/**
 * Task 1412: a wallet send that is still pending (unconfirmed when the wait
 * budget ran out) must not mark a trade leg as sent — only a confirmed result
 * counts, so the leg stays actionable after a refresh.
 */
describe("walletLegSent", () => {
  it("pending result → not sent", () => {
    expect(walletLegSent({ signature: sig, pending: true })).toBe(false);
  });

  it("confirmed result → sent", () => {
    expect(walletLegSent({ signature: sig, pending: false })).toBe(true);
  });

  it("failed send (null) → not sent", () => {
    expect(walletLegSent(null)).toBe(false);
  });
});
