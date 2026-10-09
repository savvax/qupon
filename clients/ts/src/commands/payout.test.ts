/**
 * `payout:route` / `payout:confirm-bank` builders (plan 15 D6): argument validation + hashing
 * and the generated instructions' account layout — no network, no raw bank text anywhere.
 */
import { createHash } from "node:crypto";
import { AccountRole, address, createNoopSigner } from "@solana/kit";
import { describe, expect, it } from "vitest";
import {
	CONFIRM_BANK_PAYOUT_DISCRIMINATOR,
	SET_PAYOUT_ROUTE_DISCRIMINATOR,
	getConfirmBankPayoutInstruction,
	getSetPayoutRouteInstruction,
} from "../generated/index.js";
import { entitlementPda, investorPda, routePda } from "../lib/pda.js";
import { payoutRouteArgs, sha256Bytes } from "./payout.js";

const SERIES = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
const OWNER = address("6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cve7BxX5M9rdC");
const AGENT = address("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo");

describe("payoutRouteArgs", () => {
	it("wallet: route 0 with a zero hash; bank: route 1 with sha256 of the reference", () => {
		expect(payoutRouteArgs("wallet", undefined)).toEqual({
			routeArg: 0,
			bankRefHash: new Uint8Array(32),
		});
		const bank = payoutRouteArgs("bank", "KZ86·1234567");
		expect(bank.routeArg).toBe(1);
		expect(Buffer.from(bank.bankRefHash).toString("hex")).toBe(
			createHash("sha256").update("KZ86·1234567", "utf8").digest("hex"),
		);
	});

	it("never returns the raw bank text", () => {
		expect(JSON.stringify(payoutRouteArgs("bank", "SECRET-IBAN"))).not.toContain("SECRET-IBAN");
	});

	it("rejects inconsistent arguments", () => {
		expect(() => payoutRouteArgs("paypal", undefined)).toThrow(/wallet or bank/);
		expect(() => payoutRouteArgs("bank", undefined)).toThrow(/--bank-ref is required/);
		expect(() => payoutRouteArgs("bank", "   ")).toThrow(/--bank-ref is required/);
		expect(() => payoutRouteArgs("wallet", "KZ86")).toThrow(/only applies/);
	});
});

describe("payout:route builder (set_payout_route)", () => {
	it("holder signs (writable), route PDA writable, hash — not the text — in the data", async () => {
		const owner = createNoopSigner(OWNER);
		const investor = await investorPda(SERIES, OWNER);
		const route = await routePda(investor);
		const { routeArg, bankRefHash } = payoutRouteArgs("bank", "KZ86·1234567");
		const ix = getSetPayoutRouteInstruction({
			owner,
			series: SERIES,
			investor,
			route,
			routeArg,
			bankRefHash,
		});
		const metas = ix.accounts.map(a => ({
			address: a.address,
			role: a.role,
		})); // signer metas carry an extra `signer` prop
		expect(metas).toEqual([
			{ address: OWNER, role: AccountRole.WRITABLE_SIGNER }, // the holder — nobody else may set the route
			{ address: SERIES, role: AccountRole.READONLY },
			{ address: investor, role: AccountRole.READONLY },
			{ address: route, role: AccountRole.WRITABLE },
			{
				address: address("11111111111111111111111111111111"),
				role: AccountRole.READONLY,
			}, // system program
		]);
		expect(Array.from(ix.data!.slice(0, 8))).toEqual(Array.from(SET_PAYOUT_ROUTE_DISCRIMINATOR));
		expect(ix.data![8]).toBe(1); // route = bank
		expect(Array.from(ix.data!.slice(9))).toEqual(Array.from(bankRefHash));
	});
});

describe("payout:confirm-bank builder (confirm_bank_payout)", () => {
	it("paying agent signs, the holder's entitlement is writable, only the reference hash in the data", async () => {
		const action = SERIES; // any address — the layout is what matters
		const entitlement = await entitlementPda(action, OWNER);
		const referenceHash = sha256Bytes("TX-991-SEEV");
		const ix = getConfirmBankPayoutInstruction({
			payingAgent: createNoopSigner(AGENT),
			series: SERIES,
			action,
			entitlement,
			referenceHash,
		});
		const metas = ix.accounts.map(a => ({
			address: a.address,
			role: a.role,
		})); // signer metas carry an extra `signer` prop
		expect(metas).toEqual([
			{ address: AGENT, role: AccountRole.READONLY_SIGNER },
			{ address: SERIES, role: AccountRole.READONLY },
			{ address: action, role: AccountRole.WRITABLE },
			{ address: entitlement, role: AccountRole.WRITABLE },
		]);
		expect(Array.from(ix.data!.slice(0, 8))).toEqual(Array.from(CONFIRM_BANK_PAYOUT_DISCRIMINATOR));
		expect(Array.from(ix.data!.slice(8))).toEqual(Array.from(referenceHash));
		expect(JSON.stringify(Array.from(ix.data!))).not.toContain("TX-991");
	});
});
