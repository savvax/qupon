import { describe, expect, it } from "vitest";
import { address, createNoopSigner } from "@solana/kit";
import { getMintCodec } from "@solana-program/token-2022";
import {
  bondMintExtensions,
  buildCreateBondMintInstructions,
} from "../lib/bondMint.js";
import { mintIsHooked } from "../lib/hook.js";
import { QUPON_BONDS_PROGRAM_ADDRESS } from "../generated/index.js";
import { parseSeriesCreateArgs } from "./seriesCreate.js";
const ok = {
  name: "QPN2",
  isin: "KZ2C0QUPON02",
  face: "100000",
  rateBps: "1000",
  frequency: "2",
  dayCount: "THIRTY_360",
  issueDate: "2026-07-03",
  maturityDate: "2028-07-03",
  cash: "tkzt",
};
describe("parseSeriesCreateArgs", () => {
  it("accepts valid terms", () => {
    const t = parseSeriesCreateArgs(ok);
    expect(t.faceValue).toBe(100000n);
    expect(t.frequency).toBe(2);
    expect(t.quorumBps).toBe(5000);
    expect(t.cashMint).toBe("tKZT");
  });
  it("accepts any cash mint address instead of an alias", () => {
    const mint = "HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF";
    expect(
      parseSeriesCreateArgs({ ...ok, cash: "", cashMint: mint }).cashMint,
    ).toBe(mint);
    expect(parseSeriesCreateArgs({ ...ok, cash: "usdc" }).cashMint).toBe(
      "USDC",
    );
  });
  it.each([
    [{ isin: "KZ2C0" }, /ISIN/],
    [{ rateBps: "10001" }, /rate/],
    [{ frequency: "3" }, /frequency/],
    [{ dayCount: "ACT_ACT" }, /day count/],
    [{ maturityDate: "2026-07-03" }, /maturity/],
    [{ name: "has space" }, /name/],
    [{ cash: "eur" }, /cash/],
    [{ cash: "", cashMint: "not-an-address" }, /cash-mint/],
    [{ cashMint: "HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF" }, /not both/],
    [{ cash: "" }, /cash/],
  ])("rejects %o", (patch, msg) => {
    expect(() => parseSeriesCreateArgs({ ...ok, ...patch })).toThrow(msg);
  });
});

describe("series:create mints are hooked (plan 15 D1')", () => {
  it("the mint carries TransferHook = this program, so init_series is followed by init_hook", () => {
    const SERIES = address("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
    const REGISTRAR = address("8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma");
    const MINT = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
    const exts = bondMintExtensions(SERIES, REGISTRAR);
    expect(exts).toContainEqual({
      __kind: "TransferHook",
      authority: SERIES,
      programId: QUPON_BONDS_PROGRAM_ADDRESS,
    });
    // init_series validates that extension; initSeries then arms the gate with init_hook in the same tx
    const codec = getMintCodec();
    const mint = codec.decode(
      codec.encode({
        mintAuthority: SERIES,
        supply: 0n,
        decimals: 0,
        isInitialized: true,
        freezeAuthority: SERIES,
        extensions: exts.flatMap((e) =>
          e.__kind === "MetadataPointer" || e.__kind === "DefaultAccountState"
            ? []
            : [e],
        ),
      }),
    );
    expect(mintIsHooked(mint)).toBe(true);
    expect(
      buildCreateBondMintInstructions({
        registrar: createNoopSigner(REGISTRAR),
        mint: createNoopSigner(MINT),
        series: SERIES,
        lamports: 1n,
        name: "n",
        symbol: "s",
        uri: "u",
      }).length,
    ).toBeGreaterThan(0);
  });
});
