import { getAddressDecoder, lamports, type MaybeEncodedAccount } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { rawBase64 } from "./state.js";

describe("rawBase64", () => {
  it("base64-encodes existing accounts and skips missing ones", () => {
    const a = getAddressDecoder().decode(new Uint8Array(32).fill(1));
    const b = getAddressDecoder().decode(new Uint8Array(32).fill(2));
    const data = new Uint8Array([0, 1, 2, 250, 255]);
    const accounts = [
      { address: a, exists: true, data, executable: false, lamports: lamports(1n), programAddress: b, space: 5n },
      { address: b, exists: false },
    ] as unknown as MaybeEncodedAccount[];
    const out = rawBase64(accounts);
    expect(out.size).toBe(1);
    expect(Buffer.from(out.get(a) ?? "", "base64")).toEqual(Buffer.from(data));
  });
});
