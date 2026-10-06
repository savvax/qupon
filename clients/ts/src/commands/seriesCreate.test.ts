import { describe, expect, it } from "vitest";
import { parseSeriesCreateArgs } from "./seriesCreate.js";
const ok = { name: "QPN2", isin: "KZ2C0QUPON02", face: "100000", rateBps: "1000", frequency: "2", dayCount: "THIRTY_360", issueDate: "2026-07-03", maturityDate: "2028-07-03", cash: "tkzt" };
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
    expect(parseSeriesCreateArgs({ ...ok, cash: "", cashMint: mint }).cashMint).toBe(mint);
    expect(parseSeriesCreateArgs({ ...ok, cash: "usdc" }).cashMint).toBe("USDC");
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
