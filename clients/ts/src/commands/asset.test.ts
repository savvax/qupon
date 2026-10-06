import { describe, expect, it } from "vitest";
import type { QuponConfig } from "../lib/config.js";
import { resolveCustodianAsset, resolveTestAsset } from "./asset.js";

const KZTE = "7H3MbktQifAeYqKS44ar9ck1c4kQZ3Sgj36bmQzm2atq";
const DKZT = "WsSWxpZXuuDcBmymLitFpvfEWWebiBUXBRNQRFBT29k";
const cfg = { testAssets: [
	{ symbol: "KZTE-dev", mint: KZTE, decimals: 2, kind: "stablecoin" },
	{ symbol: "dKZT", mint: DKZT, decimals: 2, kind: "wrapped_cbdc" },
] } as unknown as QuponConfig;

describe("resolveCustodianAsset", () => {
	it("finds the wrapped_cbdc asset by symbol or mint address", () => {
		expect(resolveCustodianAsset(cfg, "dKZT").mint).toBe(DKZT);
		expect(resolveCustodianAsset(cfg, DKZT).symbol).toBe("dKZT");
	});
	it("refuses non-wrapped_cbdc assets — the custodian never mints ordinary tokens", () => {
		expect(() => resolveCustodianAsset(cfg, KZTE)).toThrow(/not a wrapped_cbdc asset/);
		expect(() => resolveCustodianAsset(cfg, "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g")).toThrow(/not a wrapped_cbdc asset/);
	});
});

describe("resolveTestAsset", () => {
	it("finds the entry by mint address", () => {
		expect(resolveTestAsset(cfg, DKZT).symbol).toBe("dKZT");
		expect(resolveTestAsset(cfg, KZTE).kind).toBe("stablecoin");
	});
	it("refuses mints that are not in testAssets", () => {
		// a valid base58 address that is not registered — the faucet must never mint it
		expect(() => resolveTestAsset(cfg, "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g")).toThrow(/not in config testAssets/);
	});
	it("refuses everything when testAssets is absent", () => {
		expect(() => resolveTestAsset({} as QuponConfig, KZTE)).toThrow(/not in config testAssets/);
	});
});
