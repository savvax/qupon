import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { getBase58Encoder } from "@solana/kit";
import { chunk, sortByOwner } from "./batch.js";

// deterministic test addresses
const A = address("11111111111111111111111111111111"); // bytes all 0x00 except first
const B = address("So11111111111111111111111111111111111111112");
const C = address("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");

describe("sortByOwner", () => {
  it("sorts ascending by base58-decoded bytes", () => {
    const sorted = sortByOwner([B, A, C], (x) => x);
    // must be a permutation of input
    expect(new Set(sorted)).toEqual(new Set([A, B, C]));
    // sorted ascending by raw bytes: sort input independently and compare
    const expected = [A, B, C].map((a) => Buffer.from(getBase58Encoder().encode(a))).sort(Buffer.compare);
    expect(sorted.map((a) => Buffer.from(getBase58Encoder().encode(a)))).toEqual(expected);
  });

  it("0 items", () => expect(sortByOwner([], (x: string) => x)).toEqual([]));
  it("1 item", () => expect(sortByOwner([C], (x) => x)).toEqual([C]));

  it("does not mutate input", () => {
    const input = [B, A];
    sortByOwner(input, (x) => x);
    expect(input).toEqual([B, A]);
  });

});

describe("chunk", () => {
  const mk = (n: number) => Array.from({ length: n }, (_, i) => i);
  it.each([
    [0, 3, []],
    [2, 3, [[0, 1]]],
    [3, 3, [[0, 1, 2]]],
    [4, 3, [[0, 1, 2], [3]]],
  ])("%i items in chunks of %i", (count, n, expected) => {
    expect(chunk(mk(count), n)).toEqual(expected);
  });
  it("throws on n < 1", () => expect(() => chunk([1], 0)).toThrow());
});
