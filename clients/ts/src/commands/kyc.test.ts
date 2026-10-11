import { describe, expect, it } from "vitest";
import { address, createNoopSigner } from "@solana/kit";
import { encodeKycData, kycDataEquals } from "../lib/kyc.js";
import { planAttest } from "./kyc.js";

const provider = createNoopSigner(address("DcXPFyq5GxFc79RqM6xaWcAyrpty4KZJQJoNoEXwdNx9"));
const owner = address("9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM");
const attestation = address("Att1PDA1111111111111111111111111111111111111");
const accounts = { provider, owner, attestation, expiry: 1_900_000_000n };

describe("planAttest (kyc:attest --replace)", () => {
	it("creates when no attestation exists", () => {
		const p = planAttest(1, 0, 1500, false, null, accounts);
		expect(p.skip).toBe(false);
		expect(p.replaced).toBe(false);
		expect(p.instructions).toHaveLength(1);
	});

	it("skips when the existing data is equal (no replace)", () => {
		const p = planAttest(1, 0, 1500, false, encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1500 }), accounts);
		expect(p.skip).toBe(true);
		expect(p.replaced).toBe(false);
		expect(p.instructions).toHaveLength(0);
	});

	it("skips differing data without --replace, so callers see the mismatch, not a silent overwrite", () => {
		const p = planAttest(1, 0, 1500, false, encodeKycData({ investorType: 0, residency: 0, taxRateBps: 0 }), accounts);
		expect(p.skip).toBe(true);
		expect(p.replaced).toBe(false);
		expect(p.reason).toContain("--replace");
	});

	it("closes then re-creates in one transaction when --replace is given and the data differs", () => {
		const p = planAttest(1, 0, 1500, true, encodeKycData({ investorType: 0, residency: 0, taxRateBps: 0 }), accounts);
		expect(p.skip).toBe(false);
		expect(p.replaced).toBe(true);
		expect(p.instructions).toHaveLength(2);
		const [close, create] = p.instructions;
		expect(close.accounts[3]?.address).toBe(attestation); // the attestation account, writable for the close
		expect(create.programAddress).toBe("22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG"); // the SAS program
		expect(Array.from(create.data).join(",")).toContain(encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1500 }).join(","));
	});

	it("equal data with --replace still skips (idempotent attest)", () => {
		const p = planAttest(1, 0, 1500, true, encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1500 }), accounts);
		expect(p.skip).toBe(true);
	});

	it("kycDataEquals is bytewise (u16 LE tax makes bytes 2-3 differ)", () => {
		expect(kycDataEquals(encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1000 }), encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1000 }))).toBe(true);
		expect(kycDataEquals(encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1000 }), encodeKycData({ investorType: 1, residency: 0, taxRateBps: 1001 }))).toBe(false);
		expect(kycDataEquals(new Uint8Array([0, 0, 0]), new Uint8Array([0, 0, 0, 0]))).toBe(false);
	});
});
