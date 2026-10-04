import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { addressLink, txLink } from "./explorer.js";

const SIG = "5" + "1".repeat(86);
const ADDR = address("So11111111111111111111111111111111111111112");

describe("explorer links", () => {
  it("tx link is devnet", () => {
    expect(txLink(SIG)).toBe(`https://explorer.solana.com/tx/${SIG}?cluster=devnet`);
  });
  it("address link is devnet", () => {
    expect(addressLink(ADDR)).toBe(`https://explorer.solana.com/address/${ADDR}?cluster=devnet`);
  });
  it("rejects invalid address", () => {
    expect(() => addressLink("not-an-address")).toThrow();
  });
});
