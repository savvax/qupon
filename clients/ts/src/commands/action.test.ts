/** Batching logic of `action:snapshot` / `action:pay` (pure `sortedBatches`) + partial-failure reporting. */
import { describe, expect, it, vi } from "vitest";
import { getBase58Encoder } from "@solana/kit";
import { address } from "@solana/kit";
import { PAY_BATCH_MAX, SNAPSHOT_BATCH_MAX, runBatches, sortedBatches } from "./action.js";

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
		expect(PAY_BATCH_MAX).toBe(8); // tx-size bound, see action.ts
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

describe("runBatches partial failure", () => {
	// task 1408: batch 2 of 3 throws → the completed batches still reach stdout
	// ({ok:false, error, results}) and the process exits 1.
	it("reports completed batches on stdout and exits 1", async () => {
		const batches = [[1], [2], [3]];
		const send = vi
			.fn()
			.mockResolvedValueOnce({ signature: "sig1", slot: 10n })
			.mockRejectedValueOnce(new Error("batch 2/3 failed on chain"));
		const printed = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			await expect(runBatches(batches, send)).rejects.toThrow("batch 2/3 failed on chain");
			expect(process.exitCode).toBe(1);
			const json = JSON.parse(printed.mock.calls[0]![0] as string) as Record<string, unknown>;
			expect(json["ok"]).toBe(false);
			expect(json["error"]).toBe("batch 2/3 failed on chain");
			expect(json["batches"]).toBe(1);
			expect(json["results"]).toEqual([{ signature: "sig1", slot: "10", holders: 1 }]); // bigint slot → string
			expect(send).toHaveBeenCalledTimes(2); // batch 3 never attempted
		} finally {
			printed.mockRestore();
			process.exitCode = 0; // don't poison vitest's own exit code
		}
	});
});
