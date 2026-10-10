/** Offline verification of proof steps against a recorded devnet tx (fixtures/proof/, no network). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeEventsFromLogs, type ProofStep, type RecordedTransaction, verifyProofStep } from "./proof.js";

const PROGRAM = "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd";
const tx = JSON.parse(readFileSync(new URL("../../../../fixtures/proof/tx-investor-registered.json", import.meta.url), "utf8")) as RecordedTransaction;
const step = (expect?: ProofStep["expect"]): ProofStep => ({
	id: "coupon/s0-register-1",
	label: "S0 investor:register investor1",
	signature: "2RGRhYw2sD2NGyR3K2E1s4fh2UGyRd2ZBBd5BSwETynNyjJmkR7vNMor9B1gGAvjdTRCpbNUB6jTWRiGhyXYJ4Ue",
	slot: 507566759,
	instruction: "investor:register",
	expect,
});

describe("decodeEventsFromLogs", () => {
	it("decodes the Anchor event from a recorded tx's Program data lines", () => {
		const events = decodeEventsFromLogs(tx.meta?.logMessages ?? null);
		expect(events.map(e => e.name)).toContain("InvestorRegistered");
		expect(events.find(e => e.name === "InvestorRegistered")?.data.owner).toBe("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo");
	});

	it("ignores other programs' data lines", () => {
		expect(decodeEventsFromLogs(["Program data: AAAA", "Program log: hi"])).toEqual([]);
		expect(decodeEventsFromLogs(null)).toEqual([]);
	});
});

describe("verifyProofStep", () => {
	it("accepts a matching event expectation with fields", () => {
		expect(verifyProofStep(step({ event: "InvestorRegistered", fields: { taxRateBps: 0, residency: 0 } }), tx, PROGRAM)).toBeUndefined();
	});

	it("accepts bigint fields compared as strings", () => {
		expect(verifyProofStep(step({ event: "InvestorRegistered", fields: { slot: 507566759 } }), tx, PROGRAM)).toBeUndefined();
	});

	it("rejects a transaction that is not found", () => {
		expect(verifyProofStep(step(), null, PROGRAM)).toMatch(/not found/);
	});

	it("rejects a failed transaction", () => {
		const failed = { ...tx, meta: { ...(tx.meta as NonNullable<RecordedTransaction["meta"]>), err: { InstructionError: [0, { Custom: 6006 }] } } };
		expect(verifyProofStep(step(), failed, PROGRAM)).toMatch(/failed on-chain/);
	});

	it("rejects a transaction that never invoked the Qupon program", () => {
		expect(verifyProofStep(step(), tx, "SomeOtherProgram11111111111111111111111111111111")).toMatch(/was not invoked/);
	});

	it("rejects a missing expected event", () => {
		expect(verifyProofStep(step({ event: "EntitlementPaid" }), tx, PROGRAM)).toMatch(/EntitlementPaid was not emitted/);
	});

	it("rejects a field mismatch", () => {
		expect(verifyProofStep(step({ event: "InvestorRegistered", fields: { taxRateBps: 1 } }), tx, PROGRAM)).toMatch(/no emitted instance matches/);
	});
});
