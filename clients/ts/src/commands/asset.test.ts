import { describe, expect, it } from "vitest";
import type { QuponConfig } from "../lib/config.js";
import { resolveTestAsset } from "./asset.js";

const KZTE = "7H3MbktQifAeYqKS44ar9ck1c4kQZ3Sgj36bmQzm2atq";
const DKZT = "WsSWxpZXuuDcBmymLitFpvfEWWebiBUXBRNQRFBT29k";
const cfg = { testAssets: [
	{ symbol: "KZTE-dev", mint: KZTE, decimals: 2, kind: "stablecoin" },
	{ symbol: "dKZT", mint: DKZT, decimals: 2, kind: "wrapped_cbdc" },
] } as unknown as QuponConfig;

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
