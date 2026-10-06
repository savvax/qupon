import { address, some, type Address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { DVP_SWAP_PROGRAM_PROGRAM_ADDRESS, getSwapDvpEncoder, type SwapDvpArgs } from "../dvp/generated/index.js";
import {
	SWAP_DVP_SIZE,
	cashAmount,
	decodeTrade,
	findNonceTombstonePda,
	findSwapDvpPda,
	fundingLeg,
	parseSide,
	tradeStatus,
	type TradeSeeds,
} from "./dvp.js";

const A = (n: number): Address => address(["11111111111111111111111111111112", "11111111111111111111111111111113", "11111111111111111111111111111114", "11111111111111111111111111111115", "11111111111111111111111111111116", "11111111111111111111111111111117"][n] as string);
const seeds: TradeSeeds = { settlementAuthority: A(0), userA: A(1), userB: A(2), mintA: A(3), mintB: A(4), nonce: 7n };

// The brief's holders trade 5 bonds at par: 5 × 100,000 tiyn.
const record: SwapDvpArgs = {
	bump: 254,
	userA: A(1),
	userB: A(2),
	mintA: A(3),
	mintB: A(4),
	settlementAuthority: A(0),
	tokenProgramA: A(5),
	tokenProgramB: A(5),
	amountA: 5n,
	amountB: 500_000n,
	expiryTimestamp: 1_800_000_000n,
	nonce: 7n,
	refString: Array.from({ length: 64 }, () => 0),
	userASettlementDestination: A(1),
	userBSettlementDestination: A(2),
	mintAAuthority: A(0),
	mintBAuthority: A(0),
	earliestSettlementTimestamp: some(1_700_000_000n),
};

describe("SwapDvp record", () => {
	const bytes = getSwapDvpEncoder().encode(record);

	it("decodes what the DvP program stores", () => {
		expect(bytes.length).toBe(SWAP_DVP_SIZE);
		const t = decodeTrade(DVP_SWAP_PROGRAM_PROGRAM_ADDRESS, bytes);
		expect([t.userA, t.userB, t.mintA, t.mintB, t.settlementAuthority]).toEqual([A(1), A(2), A(3), A(4), A(0)]);
		expect([t.amountA, t.amountB, t.nonce]).toEqual([5n, 500_000n, 7n]);
	});

	it("refuses an account of another program or another size", () => {
		expect(() => decodeTrade(A(5), bytes)).toThrow(/not a Solana DvP trade/);
		expect(() => decodeTrade(DVP_SWAP_PROGRAM_PROGRAM_ADDRESS, bytes.slice(0, 450))).toThrow(/450 bytes/);
	});
});

describe("PDAs", () => {
	it("is deterministic and changes with every seed", async () => {
		const base = await findSwapDvpPda(seeds);
		expect(await findSwapDvpPda({ ...seeds })).toBe(base);
		const variants: TradeSeeds[] = [
			{ ...seeds, settlementAuthority: A(5) },
			{ ...seeds, userA: A(5) },
			{ ...seeds, userB: A(5) },
			{ ...seeds, mintA: A(5) },
			{ ...seeds, mintB: A(5) },
			{ ...seeds, nonce: 8n },
		];
		const others = await Promise.all(variants.map(findSwapDvpPda));
		expect(new Set([base, ...others]).size).toBe(7);
		expect(await findNonceTombstonePda(base)).not.toBe(base);
	});
});

describe("amounts and status", () => {
	it("prices a trade in minor units and refuses u64 overflow", () => {
		expect(cashAmount(5n, 100_000n)).toBe(500_000n);
		expect(() => cashAmount(0n, 100_000n)).toThrow(/units/);
		expect(() => cashAmount(1n << 40n, 1n << 40n)).toThrow(/u64/);
	});

	it.each([
		[0n, 0n, "awaiting_funding"],
		[5n, 0n, "awaiting_funding"],
		[0n, 500_000n, "awaiting_funding"],
		[5n, 500_000n, "ready"],
		[6n, 500_001n, "ready"],
		[null, 500_000n, "closed"],
		[5n, null, "closed"],
	] as const)("status for funded %s units / %s cash is %s", (units, cash, want) => {
		expect(tradeStatus(5n, 500_000n, units, cash)).toBe(want);
	});
});

describe("funding", () => {
	const trade = decodeTrade(DVP_SWAP_PROGRAM_PROGRAM_ADDRESS, getSwapDvpEncoder().encode(record));

	it("gives each party its own leg", () => {
		expect(fundingLeg(trade, A(1), "seller")).toEqual({ mint: A(3), tokenProgram: A(5), amount: 5n });
		expect(fundingLeg(trade, A(2), "buyer")).toEqual({ mint: A(4), tokenProgram: A(5), amount: 500_000n });
	});

	it("refuses a signer who is not that side's party", () => {
		expect(() => fundingLeg(trade, A(2), "seller")).toThrow(/is not the seller/);
		expect(() => fundingLeg(trade, A(0), "buyer")).toThrow(/is not the buyer/);
		expect(() => parseSide("both")).toThrow(/seller or buyer/);
	});
});
