/** Batching logic of `action:snapshot` / `action:pay` (pure `sortedBatches`). */
import { describe, expect, it } from "vitest";
import { getBase58Encoder } from "@solana/kit";
import { address } from "@solana/kit";
import { PAY_BATCH_MAX, SNAPSHOT_BATCH_MAX, sortedBatches } from "./action.js";

// Deterministic distinct addresses for ordering checks.
const OWNERS = [
	"So11111111111111111111111111111111111111112",
	"TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
	"TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
	"ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
	"11111111111111111111111111111112",
].map(address);

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({ owner: B58[i % 58]! + (i >= 58 ? B58[Math.floor(i / 58) % 58]! : "") }));

describe("sortedBatches batch shape", () => {
	// task 013: batching with 0, 7, 8, 9 and 23 holders at both on-chain batch limits.
	it.each([
		[0, 8, []],
		[7, 8, [7]],
		[8, 8, [8]],
		[9, 8, [8, 1]],
		[23, 8, [8, 8, 7]],
		[0, 10, []],
		[7, 10, [7]],
		[9, 10, [9]],
		[23, 10, [10, 10, 3]],
	])("%i holders in chunks of %i", (holders, size, expected) => {
		const batches = sortedBatches(mk(holders), h => h.owner, size);
		expect(batches.map(b => b.length)).toEqual(expected);
		// no holder lost or duplicated
		expect(batches.flat()).toEqual(expect.arrayContaining(mk(holders)));
		expect(batches.flat().length).toBe(holders);
	});

	it("batch limits match the on-chain program (8 snapshot / 10 pay)", () => {
		expect(SNAPSHOT_BATCH_MAX).toBe(8);
		expect(PAY_BATCH_MAX).toBe(10);
	});
});

describe("sortedBatches ordering", () => {
	it("sorts by owner pubkey bytes ascending (snapshot-hash order)", () => {
		const shuffled = [OWNERS[2]!, OWNERS[0]!, OWNERS[4]!, OWNERS[1]!, OWNERS[3]!];
		const batches = sortedBatches(shuffled, o => o, 8);
		const enc = getBase58Encoder();
		const got = batches.flat().map(o => Array.from(enc.encode(o)));
		const want = [...got].sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
		expect(got).toEqual(want);
	});
});
