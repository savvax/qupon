/**
 * Batching logic of `action:snapshot` / `action:pay` (pure `sortedBatches`), partial-failure
 * reporting, pay-batch tx sizing + idempotent cash-ATA recreation (task 1410), the holder's
 * `action:claim` pay_batch builder, demo-clock announce dates and the role-"any" signer (plan 15, task 1520).
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";
import { AccountRole, createNoopSigner, generateKeyPairSigner, getBase58Encoder } from "@solana/kit";
import { address } from "@solana/kit";
import { ASSOCIATED_TOKEN_PROGRAM_ADDRESS, findAssociatedTokenPda } from "@solana-program/token-2022";
import { ALMATY_CLOCK, CivilClock } from "../lib/clock.js";
import { loadKeypairFromPath } from "../lib/keys.js";
import { signer, withGlobals, type GlobalOptions } from "./common.js";
import {
	announceDates,
	claimPayBatchIx,
	PAY_BATCH_MAX,
	PAY_TX_BYTE_LIMIT,
	SNAPSHOT_BATCH_MAX,
	ensureCashAtas,
	payBatchBytes,
	payoutRouteIsBank,
	runBatches,
	sortedBatches,
	splitPayBatch,
} from "./action.js";

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
		expect(PAY_BATCH_MAX).toBe(4); // tx-size bound with 5 accounts per holder, see action.ts
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

describe("pay tx sizing with prepended ATA creates (task 1410)", () => {
	it("estimates the documented limits: 8 open triples fit, 10 do not", () => {
		expect(payBatchBytes(PAY_BATCH_MAX, 0)).toBeLessThanOrEqual(1232); // why PAY_BATCH_MAX is 4
		expect(payBatchBytes(5, 0)).toBeGreaterThan(1232);
	});

	it("keeps an all-open batch of PAY_BATCH_MAX in one tx", () => {
		const batch = Array.from({ length: PAY_BATCH_MAX }, (_, i) => ({ owner: `o${i}` }));
		expect(splitPayBatch(batch, () => false)).toEqual([batch]);
	});

	it("splits order-preservingly when closed-ATA creates would overflow the tx", () => {
		const holders = Array.from({ length: 8 }, (_, i) => ({ owner: `o${i}`, closed: i < 2 }));
		const batches = splitPayBatch(holders, h => h.closed);
		expect(batches.flat()).toEqual(holders); // order preserved, no holder lost
		for (const b of batches) {
			expect(payBatchBytes(b.length, b.filter(h => h.closed).length)).toBeLessThanOrEqual(PAY_TX_BYTE_LIMIT);
		}
	});

	it("an all-closed batch of PAY_BATCH_MAX splits into tx-fitting chunks", () => {
		// 4 holders with 4 ATA creates: 450 + 660 + 168 + 64 = 1342 B > limit → two halves of 928 B each
		const holders = Array.from({ length: PAY_BATCH_MAX }, (_, i) => ({ owner: `o${i}` }));
		expect(splitPayBatch(holders, () => true).map(b => b.length)).toEqual([2, 2]);
	});
});

describe("ensureCashAtas — closed cash ATA during Funded (task 1410)", () => {
	const cashMint = address("So11111111111111111111111111111111111111112");
	const cashTokenProgram = address("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

	/** Three holders with deterministic Token-2022 cash ATAs (pay_batch pays the stored investor.cash_ata). */
	async function batchOf3() {
		return Promise.all(
			OWNERS.slice(0, 3).map(async owner => ({
				owner,
				cashAta: (await findAssociatedTokenPda({ owner, mint: cashMint, tokenProgram: cashTokenProgram }))[0],
			})),
		);
	}

	it("prepends exactly one idempotent create for the closed holder's stored ATA", async () => {
		const payer = await generateKeyPairSigner();
		const batch = await batchOf3();
		const missing = new Set([batch[1]!.cashAta as string]); // holder 2 closed their empty ATA
		const ixs = ensureCashAtas({ batch, missing, payer, cashMint, cashTokenProgram });
		expect(ixs).toHaveLength(1);
		const ix = ixs[0]!;
		expect(ix.programAddress).toBe(ASSOCIATED_TOKEN_PROGRAM_ADDRESS);
		expect(Array.from(ix.data as Uint8Array)).toEqual([1]); // idempotent discriminator, not the failing create
		const roleOf = new Map(ix.accounts.map(a => [a.address as string, a.role]));
		expect(roleOf.get(batch[1]!.cashAta as string)).toBe(AccountRole.WRITABLE); // recreated at the stored cash_ata
		expect(roleOf.get(OWNERS[1] as string)).toBe(AccountRole.READONLY);
		expect(roleOf.get(payer.address as string)).toBe(AccountRole.WRITABLE_SIGNER); // registrar pays rent
		expect(roleOf.get(cashMint as string)).toBe(AccountRole.READONLY);
		expect(roleOf.get(cashTokenProgram as string)).toBe(AccountRole.READONLY);
		expect(roleOf.get(address("11111111111111111111111111111111") as string)).toBe(AccountRole.READONLY); // system program
	});

	it("creates none when every ATA exists, all when every ATA is closed", async () => {
		const payer = await generateKeyPairSigner();
		const batch = await batchOf3();
		const none = ensureCashAtas({ batch, missing: new Set(), payer, cashMint, cashTokenProgram });
		expect(none).toHaveLength(0); // the normal path adds no instructions
		const all = ensureCashAtas({
			batch,
			missing: new Set(batch.map(h => h.cashAta as string)),
			payer,
			cashMint,
			cashTokenProgram,
		});
		expect(all).toHaveLength(3);
	});
});

describe("payoutRouteIsBank (plan 15 D6)", () => {
	it("reads the route byte after discriminator, bump and investor", () => {
		const data = new Uint8Array(82);
		expect(payoutRouteIsBank(data)).toBe(false);
		data[41] = 1;
		expect(payoutRouteIsBank(data)).toBe(true);
		expect(payoutRouteIsBank(new Uint8Array(10))).toBe(false);
	});
});

describe("announceDates (plan 15 D7 — demo clock derives the dates)", () => {
	// 1 s per civil day anchored at 2026-10-09: a whole bond life in minutes.
	const demo = CivilClock.demo(1, 1_791_000_000, { y: 2026, m: 10, d: 9 });

	it("demo: record = period end − 1 series-day, payment = period end + delay series-days", () => {
		expect(announceDates({}, 1_000n, demo)).toEqual({ recordAt: 999n, paymentAt: 1_000n });
		expect(announceDates({ paymentDelayDays: "2" }, 1_000n, demo)).toEqual({ recordAt: 999n, paymentAt: 1_002n });
	});

	it("demo: explicit --record-at/--payment-at win (the demo scripts pin exact seconds)", () => {
		expect(announceDates({ recordAt: "995", paymentAt: "1017" }, 1_000n, demo)).toEqual({ recordAt: 995n, paymentAt: 1017n });
	});

	it("real: both timestamps required; --payment-delay-days rejected", () => {
		expect(announceDates({ recordAt: "10", paymentAt: "20" }, 1_000n, ALMATY_CLOCK)).toEqual({ recordAt: 10n, paymentAt: 20n });
		expect(() => announceDates({ recordAt: "10" }, 1_000n, ALMATY_CLOCK)).toThrow(/required on a real-clock/);
		expect(() => announceDates({ recordAt: "10", paymentAt: "20", paymentDelayDays: "1" }, 1_000n, ALMATY_CLOCK)).toThrow(/only applies to a demo-clock/);
	});
});

describe("claimPayBatchIx (action:claim, plan 15 D2/D6)", () => {
	it("appends the holder's 5 pay accounts after the 9 fixed ones, holder as authority", () => {
		const holder = createNoopSigner(OWNERS[1]!);
		const fixed = OWNERS.slice(2).map(a => a as string); // series, action, cashMint, escrow, taxVault, cashTokenProgram, mint…
		const ix = claimPayBatchIx({
			holder,
			series: fixed[0]!,
			action: fixed[1]!,
			cashMint: fixed[2]!,
			escrow: fixed[3]!,
			taxVault: fixed[4]!,
			cashTokenProgram: fixed[5]!,
			mint: fixed[6]!,
			entitlement: fixed[0]!,
			investor: fixed[1]!,
			route: fixed[2]!,
			cashAta: fixed[3]!,
			bondAta: fixed[4]!,
		});
		// Signer metas carry an extra `signer` prop — compare the wire shape (address, role) only.
		const metas = ix.accounts.map(a => ({ address: a.address, role: a.role }));
		// 9 fixed pay_batch accounts + [Entitlement (w), Investor, PayoutRoute, cash destination (w), bond ATA (w)]
		expect(metas).toHaveLength(14);
		expect(metas[0]).toEqual({ address: holder.address, role: AccountRole.READONLY_SIGNER }); // anyone may pay
		expect(metas.slice(9)).toEqual([
			{ address: fixed[0]!, role: AccountRole.WRITABLE },
			{ address: fixed[1]!, role: AccountRole.READONLY },
			{ address: fixed[2]!, role: AccountRole.READONLY },
			{ address: fixed[3]!, role: AccountRole.WRITABLE },
			{ address: fixed[4]!, role: AccountRole.WRITABLE },
		]);
	});
});

describe("signer role \"any\" (permissionless crank, plan 15 D2)", () => {
	const dir = mkdtempSync(join(tmpdir(), "qupon-signer-"));
	const VARS = ["QUPON_KEYPAIR", "QUPON_CRANK_KEYPAIR", "QUPON_REGISTRAR_KEYPAIR"] as const;
	/** A solana-keygen style file: [secret 32, public 32] — node's DER encodings end with exactly those bytes. */
	const kpFile = (name: string): string => {
		const { privateKey, publicKey } = generateKeyPairSync("ed25519");
		const priv = privateKey.export({ type: "pkcs8", format: "der" }) as Buffer;
		const pub = publicKey.export({ type: "spki", format: "der" }) as Buffer;
		writeFileSync(join(dir, name), JSON.stringify([...priv.subarray(-32), ...pub.subarray(-32)]));
		return join(dir, name);
	};
	const cmd = (): Command => withGlobals(new Command("t"));

	it("resolves --keypair > QUPON_CRANK_KEYPAIR > registrar (QUPON_KEYPAIR ignored for role any)", async () => {
		const flag = kpFile("flag.json");
		const generic = kpFile("generic.json");
		const crank = kpFile("crank.json");
		const registrar = kpFile("registrar.json");
		const as = async (p: string) => (await loadKeypairFromPath(p)).address;
		try {
			process.env.QUPON_KEYPAIR = generic;
			process.env.QUPON_CRANK_KEYPAIR = crank;
			process.env.QUPON_REGISTRAR_KEYPAIR = registrar;
			expect((await signer(cmd(), "any")).address).toBe(await as(crank));
			const c = cmd();
			(c.opts() as GlobalOptions).keypair = flag;
			expect((await signer(c, "any")).address).toBe(await as(flag));
			delete process.env.QUPON_KEYPAIR;
			delete process.env.QUPON_CRANK_KEYPAIR;
			expect((await signer(cmd(), "any")).address).toBe(await as(registrar)); // operators keep working
		} finally {
			for (const v of VARS) delete process.env[v];
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("without any keypair it names the env vars it looked for", async () => {
		const saved = VARS.map(v => [v, process.env[v]] as const);
		try {
			for (const v of VARS) delete process.env[v];
			await expect(signer(cmd(), "any")).rejects.toThrow(/QUPON_CRANK_KEYPAIR.*QUPON_REGISTRAR_KEYPAIR/s);
		} finally {
			for (const [v, val] of saved) if (val !== undefined) process.env[v] = val;
		}
	});
});
