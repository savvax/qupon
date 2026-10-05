import { describe, expect, it } from "vitest";
import { address } from "@solana/kit";
import { AccountState, getMintSize } from "@solana-program/token-2022";
import type { QuponSeriesConfig } from "./config.js";
import { bondMetadataFields, bondMintExtensions, bondMintSize, maturityYmd } from "./bondMint.js";
import { actionPda, entitlementPda, investorPda, seriesPda } from "./pda.js";
import { findInvestorPda, findSeriesPda } from "../generated/index.js";

// Any valid addresses — PDA/size math does not care which.
const SERIES = address("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
const REGISTRAR = address("8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma");
const MINT = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
const OWNER = address("6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cve7BxX5M9rdC");

describe("bond mint extension list", () => {
  it("contains exactly the five fixed extensions with the right authorities", () => {
    const exts = bondMintExtensions(SERIES, REGISTRAR);
    expect(exts.map(e => e.__kind).sort()).toEqual([
      "DefaultAccountState",
      "MetadataPointer",
      "MintCloseAuthority",
      "PausableConfig",
      "PermanentDelegate",
    ]);
    for (const e of exts) {
      if (e.__kind === "PermanentDelegate") expect(e.delegate).toBe(SERIES);
      if (e.__kind === "PausableConfig") expect(e.authority).toBe(SERIES);
      if (e.__kind === "MintCloseAuthority") expect(e.closeAuthority).toBe(SERIES);
      if (e.__kind === "MetadataPointer") expect(e.authority).toBe(REGISTRAR);
      if (e.__kind === "DefaultAccountState") expect(e.state).toBe(AccountState.Frozen);
    }
  });

  it("size is deterministic, order-independent and covers every extension", () => {
    // base mint (82) + fixed extension layout per docs/02-architecture.md; matches
    // what `spl-token display` reports for a mint created by scripts/create-bond-mint.ts
    expect(bondMintSize(SERIES, REGISTRAR)).toBe(348);
    const shuffled = [...bondMintExtensions(SERIES, REGISTRAR)].reverse();
    expect(getMintSize(shuffled)).toBe(bondMintSize(SERIES, REGISTRAR));
  });
});


describe("bond metadata fields", () => {
  const cfg: QuponSeriesConfig = {
    mint: "",
    cashMint: "tKZT",
    isin: "KZ2C0QUPON01",
    faceValue: 100000,
    couponRateBps: 1000,
    frequency: 2,
    dayCount: "THIRTY_360",
    termYears: 2,
  };

  it("writes the architecture-doc keys with status ACTIVE", () => {
    // 2026-10-12 15:00 UTC = 2026-10-12 20:00 Almaty → +2 years
    const now = Date.UTC(2026, 9, 12, 15) / 1000;
    expect(Object.fromEntries(bondMetadataFields(cfg, now).map(f => [f.field, f.value]))).toEqual({
      isin: "KZ2C0QUPON01",
      face_value: "100000",
      coupon_rate_bps: "1000",
      frequency: "2",
      day_count: "THIRTY_360",
      maturity: "2028-10-12",
      status: "ACTIVE",
    });
  });

  it("computes maturity in Almaty local time and clamps Feb 29 → Feb 28", () => {
    // 2028-02-28 20:00 UTC = 2028-02-29 01:00 Almaty (leap); +1 year does not exist → 2029-02-28
    expect(maturityYmd(Date.UTC(2028, 1, 28, 20) / 1000, 1)).toEqual({ y: 2029, m: 2, d: 28 });
    // 2026-10-12 23:00 UTC is already 2026-10-13 in Almaty
    expect(maturityYmd(Date.UTC(2026, 9, 12, 23) / 1000, 1)).toEqual({ y: 2027, m: 10, d: 13 });
  });
});

describe("pda helpers", () => {
  it("series/investor match the generated finders (same seeds)", async () => {
    expect(await seriesPda(MINT)).toBe((await findSeriesPda({ mint: MINT }))[0]);
    expect(await investorPda(SERIES, OWNER)).toBe((await findInvestorPda({ series: SERIES, owner: OWNER }))[0]);
  });

  it("action index is u32 little-endian: 0, 1 and 256 give distinct stable addresses", async () => {
    const a0 = await actionPda(SERIES, 0);
    const a1 = await actionPda(SERIES, 1);
    const a256 = await actionPda(SERIES, 256);
    expect(new Set([a0, a1, a256]).size).toBe(3);
    expect(await actionPda(SERIES, 0)).toBe(a0);
    expect(await entitlementPda(a1, OWNER)).toBe(await entitlementPda(a1, OWNER));
  });
});
