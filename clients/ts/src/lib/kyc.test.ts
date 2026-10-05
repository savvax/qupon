import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { KYC_CREDENTIAL, KYC_PROVIDER, KYC_SCHEMA, deriveKycAddresses, encodeKycData } from "./kyc.js";

describe("SAS KYC", () => {
	it("credential and schema addresses derive from the provider and match the program constants", async () => {
		expect(await deriveKycAddresses(KYC_PROVIDER)).toEqual({ credential: KYC_CREDENTIAL, schema: KYC_SCHEMA });
		const rs = readFileSync(new URL("../../../../programs/qupon_bonds/src/constants.rs", import.meta.url), "utf8");
		expect(rs).toContain(`KYC_CREDENTIAL: Pubkey = pubkey!("${KYC_CREDENTIAL}")`);
		expect(rs).toContain(`KYC_SCHEMA: Pubkey = pubkey!("${KYC_SCHEMA}")`);
	});
	it("encodes attributes in schema order, u16 little-endian", () => {
		expect([...encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1500 })]).toEqual([1, 0, 0xdc, 0x05]);
	});
});
