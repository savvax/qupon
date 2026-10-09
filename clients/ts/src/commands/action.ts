/**
 * `action:*` — the corporate-action lifecycle (INTR coupon flow): announce,
 * cancel, strike, snapshot (auto-batched), finalize, fund, pay (auto-batched),
 * complete. Batching is deterministic: holders sorted by owner pubkey ascending
 * (the snapshot-hash order), then fixed-size chunks sent sequentially.
 */
import { fetchEncodedAccounts, isSome, type Address, type Instruction, type TransactionSigner } from "@solana/kit";
import {
	findAssociatedTokenPda,
	getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token-2022";
import type { Command } from "commander";
import {
	fetchCorporateAction,
	type CorporateAction,
	getAnnounceActionInstructionAsync,
	getCancelActionInstruction,
	getCompleteActionInstruction,
	getDeclareDefaultInstruction,
	getFinalizeSnapshotInstruction,
	getFundActionInstruction,
	getPayBatchInstruction,
	getSnapshotBatchInstruction,
	getStrikeRecordInstruction,
	findCheckpointPda,
	getTradeAdmissionDecoder,
	getTradeAdmissionSize,
	TRADE_ADMISSION_DISCRIMINATOR,
	getSweepEscrowInstruction,
} from "../generated/index.js";
import { chunk, sortByOwner } from "../lib/batch.js";
import { accrualDays, dayCountFromCode, packYmd } from "../lib/daycount.js";
import { ALMATY_CLOCK, type CivilClock, seriesClock } from "../lib/clock.js";
import { txLink } from "../lib/explorer.js";
import { actionPda, entitlementPda, investorPda } from "../lib/pda.js";
import type { QuponRpc } from "../lib/tx.js";
import {
	defaultCorpId,
	initCtx,
	listEntitlements,
	listByKey,
	listInvestors,
	loadSeries,
	log,
	out,
	parseAt,
	parseBigInt,
	parseIntArg,
	parseYmd,
	padAscii,
	ro,
	sendAndReport,
	sendQuiet,
	signer,
	tokenProgramOfMint,
	withGlobals,
	wr,
	type GlobalOptions,
	type SeriesInfo,
	type TxReport,
} from "./common.js";

/** Batch sizing fixed by docs/02-architecture.md (must match the on-chain limits). */
export const SNAPSHOT_BATCH_MAX = 8;
// On-chain max is 10, but 10 triples (38 unique keys) exceed the 1232-byte tx limit without a lookup table; 8 fit.
export const PAY_BATCH_MAX = 8;

/**
 * Deterministic batching: sort by owner pubkey ascending, then fixed chunks.
 * Pure — unit-tested for 0, 7, 8, 9 and 23 holders.
 */
export function sortedBatches<T>(items: readonly T[], ownerOf: (item: T) => string, size: number): T[][] {
	return chunk(sortByOwner([...items], ownerOf), size);
}

/**
 * Wire-size estimate of one pay-batch tx (single signature, no lookup table):
 * 384 B fixed (header, blockhash, 8 base keys, compute-budget + pay instruction overhead)
 * + 99 B per pay triple (3 keys + 3 indices) + 42 B per create (+64 B shared ATA/system program keys).
 * Pure — unit-tested against the documented 8-fits/10-doesn't limits.
 */
export function payBatchBytes(holders: number, creates: number): number {
	return 384 + 99 * holders + 42 * creates + (creates > 0 ? 64 : 0);
}

/** Max wire size minus a safety margin for varints and rounding in the estimate above. */
export const PAY_TX_BYTE_LIMIT = 1232 - 52;

/**
 * Split a pay batch (recursively, order-preserving) until every tx — the pay triples plus
 * the prepended ATA creates for closed accounts — fits {@link PAY_TX_BYTE_LIMIT}.
 * Pure — unit-tested for all-open, mixed and all-closed batches.
 */
export function splitPayBatch<T>(batch: readonly T[], closedOf: (item: T) => boolean, limit: number = PAY_TX_BYTE_LIMIT): (readonly T[])[] {
	const size = (b: readonly T[]): number => payBatchBytes(b.length, b.filter(closedOf).length);
	if (size(batch) <= limit || batch.length <= 1) return [batch];
	const mid = Math.ceil(batch.length / 2);
	return [...splitPayBatch(batch.slice(0, mid), closedOf, limit), ...splitPayBatch(batch.slice(mid), closedOf, limit)];
}

/**
 * Task 1410: a holder may close their empty cash ATA during Funded. pay_batch pays the
 * stored investor.cash_ata, so prepend an idempotent create for each missing ATA to the
 * batch tx (the ATA program is universal — works for classic SPL and Token-2022 cash mints).
 */
export function ensureCashAtas(args: {
	batch: readonly { owner: Address; cashAta: Address }[];
	missing: ReadonlySet<string>;
	payer: TransactionSigner;
	cashMint: Address;
	cashTokenProgram: Address;
}): Instruction[] {
	return args.batch
		.filter(h => args.missing.has(h.cashAta as string))
		.map(h =>
			getCreateAssociatedTokenIdempotentInstruction({
				payer: args.payer,
				ata: h.cashAta,
				owner: h.owner,
				mint: args.cashMint,
				tokenProgram: args.cashTokenProgram,
			}),
		);
}

/**
 * Send fixed batches sequentially. On a mid-run failure, print the completed
 * batches on stdout ({ok:false, error, results}) and rethrow with exit code 1:
 * those transactions already moved money and must survive for the registrar's
 * activity log (task 1408).
 */
export async function runBatches<T>(
	batches: readonly (readonly T[])[],
	sendBatch: (batch: readonly T[], index: number) => Promise<TxReport>,
): Promise<(TxReport & { holders: number })[]> {
	const results: (TxReport & { holders: number })[] = [];
	for (const [i, batch] of batches.entries()) {
		try {
			results.push({ ...(await sendBatch(batch, i)), holders: batch.length });
		} catch (e) {
			process.exitCode = 1;
			out({ ok: false, error: (e as Error).message, batches: results.length, results });
			throw e;
		}
	}
	return results;
}

/** Resolve the working action: --index, else the series' open action. */
export async function loadAction(
	rpc: QuponRpc,
	info: SeriesInfo,
	indexArg: string | undefined,
): Promise<{ action: Address; account: CorporateAction }> {
	const open = info.account.openAction;
	const action = indexArg !== undefined ? await actionPda(info.pda, parseIntArg(indexArg, "--index")) : isSome(open) ? open.value : null;
	if (action === null) throw new Error("series has no open action — pass --index <n>");
	return { action, account: (await fetchCorporateAction(rpc, action)).data };
}

interface AnnounceOpts extends GlobalOptions {
	series: string;
	recordAt: string;
	paymentAt: string;
	officialId?: string;
	corpId?: string;
	kind: string;
	callDate?: string;
	factorBps?: string;
}

/** Cash kinds `action:announce` accepts (BMET has its own command, CHAN is never announced). */
export const CASH_KINDS = { INTR: 0, REDM: 1, MCAL: 2, PCAL: 3 } as const;
export type CashKind = keyof typeof CASH_KINDS;

/**
 * Period end and factor per kind (checked on-chain against the series schedule):
 * INTR → next coupon date, REDM → maturity, MCAL/PCAL → the call date (before the next coupon).
 */
export function announcePlan(
	kind: string,
	s: { nextCouponDate: bigint; maturityDate: bigint },
	callDate: string | undefined,
	factorBps: string | undefined,
	clock: CivilClock = ALMATY_CLOCK,
): { kind: CashKind; code: number; periodEnd: bigint; factorBps: number } {
	const k = kind.toUpperCase();
	if (!(k in CASH_KINDS)) throw new Error(`--kind must be one of ${Object.keys(CASH_KINDS).join("|")}, got '${kind}'`);
	const code = CASH_KINDS[k as CashKind];
	const call = k === "MCAL" || k === "PCAL";
	if (call && callDate === undefined) throw new Error(`--call-date YYYY-MM-DD is required for ${k}`);
	if (!call && callDate !== undefined) throw new Error(`--call-date only applies to MCAL/PCAL`);
	const factor = factorBps === undefined ? 0 : parseIntArg(factorBps, "--factor-bps");
	if (k === "PCAL" && (factor <= 0 || factor >= 10_000)) throw new Error("--factor-bps must be 1..9999 for PCAL");
	if (k !== "PCAL" && factor !== 0) throw new Error("--factor-bps only applies to PCAL");
	// A call date is a midnight of the series clock (demo series map civil dates to compressed days, plan 15 D7).
	const periodEnd = k === "INTR" ? s.nextCouponDate : k === "REDM" ? s.maturityDate : BigInt(clock.ts(parseYmd(callDate ?? "", "--call-date")));
	return { kind: k as CashKind, code, periodEnd, factorBps: factor };
}

async function runAnnounce(opts: AnnounceOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const s = info.account;
	// The period always starts at Series.period_start and the rate is a series term (checked on-chain).
	const clock = seriesClock(s);
	const plan = announcePlan(opts.kind, s, opts.callDate, opts.factorBps, clock);
	const periodStart = s.periodStart;
	const periodEnd = plan.periodEnd;
	const startYmd = clock.civil(Number(periodStart));
	const endYmd = clock.civil(Number(periodEnd));
	const days = accrualDays(dayCountFromCode(s.dayCount), startYmd, endYmd);
	const recordAt = parseAt(opts.recordAt, "--record-at");
	const paymentAt = parseAt(opts.paymentAt, "--payment-at");
	const index = s.actionCount;
	const corpId =
		opts.corpId ?? defaultCorpId(info.name, plan.kind, index + 1); // e.g. QPNb1-INTR-0001
	const action = await actionPda(info.pda, index);
	log(`announcing ${plan.kind} #${index} (${corpId}): ${days} accrual days, period ${periodStart} → ${periodEnd}`);
	const instruction = await getAnnounceActionInstructionAsync({
		authority: registrar,
		series: info.pda,
		action,
		cashMint: s.cashMint,
		cashTokenProgram: await tokenProgramOfMint(rpc, s.cashMint),
		kind: plan.code,
		mandatory: 0, // MAND
		corpId: padAscii(corpId, 16),
		officialId: padAscii(opts.officialId ?? "", 16),
		recordAt,
		paymentAt,
		periodStartYmd: packYmd(startYmd),
		periodEndYmd: packYmd(endYmd),
		periodStartTs: periodStart,
		periodEndTs: periodEnd,
		accrualDays: days,
		rateBps: s.couponRateBps,
		factorBps: plan.factorBps,
		proposalNewRateBps: 0,
		proposalNewMaturity: 0n,
		votingEndsAt: 0n,
	});
	await sendAndReport(rpc, registrar, [instruction], "action:announce", {
		action,
		index,
		corpId,
		kind: plan.kind,
		accrualDays: days,
		rateBps: s.couponRateBps,
		recordAt,
		paymentAt,
	});
}

interface ActionOpts extends GlobalOptions {
	series: string;
	index?: string;
}

async function runCancel(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getCancelActionInstruction({ registrar, series: info.pda, action });
	await sendAndReport(rpc, registrar, [instruction], "action:cancel", { action });
}

/** Declare the open action in default (plan 15 D4): payment date + one series day passed, escrow short (anyone). */
async function runDefault(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const payer = await signer(cmd, "registrar"); /* any keypair may declare it: --keypair overrides */
	const { action, account } = await loadAction(rpc, info, opts.index);
	const instruction = getDeclareDefaultInstruction({ payer, series: info.pda, action, escrow: account.escrow });
	await sendAndReport(rpc, payer, [instruction], "action:default", { action });
}

async function runStrike(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getStrikeRecordInstruction({
		authority,
		series: info.pda,
		action,
		mint: info.mint,
	});
	await sendAndReport(rpc, authority, [instruction], "action:strike", { action });
}

/** Positions per hooked `snapshot_batch` (4–5 accounts each keeps the transaction under the size limit). */
export const HOOKED_SNAPSHOT_BATCH = 5;

/**
 * Hooked series (plan 15 D1'): positions are every investor's bond ATA and every admitted DvP escrow (counted for the
 * seller); each advances its owner's checkpoint. Order does not matter (set hash) and re-sent positions are no-ops.
 */
async function runSnapshotHooked(
	rpc: QuponRpc,
	info: SeriesInfo,
	authority: TransactionSigner,
	action: Address,
	investors: readonly { address: Address; owner: Address; bondAta: Address }[],
): Promise<void> {
	const admissions = await listByKey(rpc, TRADE_ADMISSION_DISCRIMINATOR, getTradeAdmissionSize(), info.pda, getTradeAdmissionDecoder());
	const checkpoint = async (owner: Address) => (await findCheckpointPda({ series: info.pda, owner }))[0];
	const positions = [];
	for (const h of investors) {
		positions.push([ro(h.address), ro(h.bondAta), wr(await entitlementPda(action, h.owner)), wr(await checkpoint(h.owner))]);
	}
	for (const { address, data: a } of admissions) {
		positions.push([
			ro(address),
			ro(a.escrow),
			wr(await entitlementPda(action, a.seller)),
			wr(await checkpoint(a.swapDvp)),
			ro(await investorPda(info.pda, a.seller)),
		]);
	}
	const batches = chunk(positions, HOOKED_SNAPSHOT_BATCH);
	log(`snapshotting ${investors.length} holders + ${admissions.length} escrow(s) in ${batches.length} batch(es)`);
	const results = await runBatches(batches, async (batch, i) => {
		const base = getSnapshotBatchInstruction({ authority, series: info.pda, action, mint: info.mint });
		const instruction = { ...base, accounts: [...base.accounts, ...batch.flat()] };
		const report = await sendQuiet(rpc, authority, [instruction], `action:snapshot batch ${i + 1}/${batches.length}`);
		log(`  batch ${i + 1}/${batches.length}: ${report.signature} (${txLink(report.signature)})`);
		return report;
	});
	out({ ok: true, action, batches: results.length, holders: investors.length, escrows: admissions.length, results });
}

async function runSnapshot(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action } = await loadAction(rpc, info, opts.index);
	const investors = await listInvestors(rpc, info.pda);
	if (info.account.hook === 1) {
		await runSnapshotHooked(rpc, info, authority, action, investors);
		return;
	}
	const batches = sortedBatches(investors, h => h.owner, SNAPSHOT_BATCH_MAX);
	log(`snapshotting ${investors.length} holders in ${batches.length} batch(es) of ≤ ${SNAPSHOT_BATCH_MAX}`);
	const results = await runBatches(batches, async (batch, i) => {
		const metas = [];
		for (const holder of batch) {
			// remaining_accounts order: [Investor, bond ATA, Entitlement (writable)]
			metas.push(ro(holder.address), ro(holder.bondAta), wr(await entitlementPda(action, holder.owner)));
		}
		const base = getSnapshotBatchInstruction({
			authority,
			series: info.pda,
			action,
			mint: info.mint,
		});
		const instruction = { ...base, accounts: [...base.accounts, ...metas] };
		const report = await sendQuiet(rpc, authority, [instruction], `action:snapshot batch ${i + 1}/${batches.length}`);
		log(`  batch ${i + 1}/${batches.length}: ${report.signature} (${txLink(report.signature)})`);
		return report;
	});
	out({
		ok: true,
		action,
		batches: results.length,
		holders: investors.length,
		results,
	});
}

async function runFinalizeSnapshot(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getFinalizeSnapshotInstruction({
		authority,
		series: info.pda,
		action,
		mint: info.mint,
	});
	await sendAndReport(rpc, authority, [instruction], "action:finalize-snapshot", { action });
}

interface FundOpts extends GlobalOptions {
	series: string;
	index?: string;
	amount?: string;
}

async function runFund(opts: FundOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const funder = await signer(cmd, "issuer");
	const { action, account } = await loadAction(rpc, info, opts.index);
	const cashMint = info.account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	// Default: whatever the escrow still lacks (net + tax + principal − balance) — re-runs never over-fund.
	const need = account.totalNet + account.totalTax + account.totalPrincipal;
	const { value: escrowBalance } = await rpc.getTokenAccountBalance(account.escrow).send();
	const shortfall = need > BigInt(escrowBalance.amount) ? need - BigInt(escrowBalance.amount) : 0n;
	const amount = opts.amount !== undefined ? parseBigInt(opts.amount, "--amount") : shortfall;
	if (amount === 0n) {
		log(`escrow already holds ${escrowBalance.amount} ≥ required ${need}; nothing to fund`);
		out({ ok: true, command: "action:fund", action, skipped: true });
		return;
	}
	log(`funding ${amount} minor units (required: ${need})`);
	const instruction = getFundActionInstruction({
		funder,
		series: info.pda,
		action,
		cashMint,
		funderCash: (await findAssociatedTokenPda({ owner: funder.address, tokenProgram: cashTokenProgram, mint: cashMint }))[0],
		escrow: account.escrow,
		cashTokenProgram,
		amount,
	});
	await sendAndReport(rpc, funder, [instruction], "action:fund", { action, amount });
}

async function runPay(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action, account } = await loadAction(rpc, info, opts.index);
	const cashMint = account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	// Payable = entitlements still Snapshotted (re-runs skip Paid ones — idempotent).
	const [investors, entitlements] = await Promise.all([listInvestors(rpc, info.pda), listEntitlements(rpc, action)]);
	const byOwner = new Map(investors.map(inv => [inv.owner as string, inv]));
	const payable = entitlements
		.filter(e => e.status === 0) // Snapshotted
		.map(e => {
			const investor = byOwner.get(e.owner);
			if (investor === undefined) throw new Error(`no Investor PDA for entitlement owner ${e.owner}`);
			return { owner: e.owner, entitlement: e.address, investor: investor.address, cashAta: investor.cashAta };
		});
	// Task 1410: a holder may close their empty cash ATA during Funded — pay_batch pays the stored
	// investor.cash_ata, so recreate the missing ones idempotently in the same tx; batches whose
	// tx would overflow the 1232-byte limit split (deterministic order preserved).
	const atStatus = await fetchEncodedAccounts(rpc, payable.map(h => h.cashAta));
	const missingAta = new Set(atStatus.filter(a => !a.exists).map(a => a.address as string));
	if (missingAta.size > 0) log(`recreating ${missingAta.size} closed cash ATA(s) idempotently`);
	const batches = sortedBatches(payable, h => h.owner, PAY_BATCH_MAX).flatMap(b => splitPayBatch(b, h => missingAta.has(h.cashAta)));
	log(`paying ${payable.length} holder(s) in ${batches.length} batch(es) of ≤ ${PAY_BATCH_MAX}`);
	const results = await runBatches(batches, async (batch, i) => {
		const metas = [];
		for (const holder of batch) {
			// remaining_accounts order: [Entitlement (writable), Investor, cash ATA (writable)]
			metas.push(wr(holder.entitlement), ro(holder.investor), wr(holder.cashAta));
		}
		const base = getPayBatchInstruction({
			authority,
			series: info.pda,
			action,
			cashMint,
			escrow: account.escrow,
			taxVault: info.account.taxVault,
			cashTokenProgram,
		});
		const instruction = { ...base, accounts: [...base.accounts, ...metas] };
		// Prepended before pay_batch so the closed-ATA holder is payable in the same tx (task 1410).
		const instructions = [...ensureCashAtas({ batch, missing: missingAta, payer: authority, cashMint, cashTokenProgram }), instruction];
		const report = await sendQuiet(rpc, authority, instructions, `action:pay batch ${i + 1}/${batches.length}`);
		log(`  batch ${i + 1}/${batches.length}: ${report.signature} (${txLink(report.signature)})`);
		return report;
	});
	out({ ok: true, action, batches: results.length, holders: payable.length, results });
}

async function runComplete(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getCompleteActionInstruction({
		authority,
		series: info.pda,
		action,
		mint: info.mint,
	});
	await sendAndReport(rpc, authority, [instruction], "action:complete", { action });
}

async function runSweep(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action, account } = await loadAction(rpc, info, opts.index);
	// A closed escrow means the sweep already ran (the instruction closes the account).
	const { value: escrow } = await rpc.getAccountInfo(account.escrow, { commitment: "confirmed", encoding: "base64" }).send();
	if (escrow === null) {
		out({ ok: true, command: "action:sweep", action, skipped: "already swept" });
		return;
	}
	const cashMint = info.account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	const issuer = info.account.issuer;
	const issuerCash = (await findAssociatedTokenPda({ owner: issuer, tokenProgram: cashTokenProgram, mint: cashMint }))[0];
	const { value: balance } = await rpc.getTokenAccountBalance(account.escrow).send();
	log(`sweeping ${balance.amount} minor units from the escrow back to the issuer's cash account`);
	const instructions = [
		// The destination is any issuer cash account — create the ATA idempotently in the same tx.
		getCreateAssociatedTokenIdempotentInstruction({
			payer: registrar,
			ata: issuerCash,
			owner: issuer,
			mint: cashMint,
			tokenProgram: cashTokenProgram,
		}),
		getSweepEscrowInstruction({
			authority: registrar,
			series: info.pda,
			action,
			cashMint,
			escrow: account.escrow,
			issuerCash,
			cashTokenProgram,
		}),
	];
	await sendAndReport(rpc, registrar, instructions, "action:sweep", { action, amount: BigInt(balance.amount) });
}

const indexOpt = "--index <n>" as const;

export function registerActionCommands(program: Command): void {
	withGlobals(program.command("action:announce").description("announce a cash action: INTR coupon, REDM at maturity, MCAL/PCAL early call"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--record-at <ts>", "record date: unix ts or +seconds from now")
		.requiredOption("--payment-at <ts>", "payment date: unix ts or +seconds from now")
		.option("--kind <kind>", "INTR | REDM | MCAL | PCAL", "INTR")
		.option("--call-date <ymd>", "MCAL/PCAL: call date YYYY-MM-DD (accrued coupon ends here)")
		.option("--factor-bps <n>", "PCAL: share of face redeemed, bps")
		.option("--corp-id <id>", "CORP id, ≤ 16 bytes (default: <series>-<KIND>-####)")
		.option("--official-id <id>", "COAF id assigned by KASE (optional)")
		.action(runAnnounce);

	withGlobals(program.command("action:cancel").description("cancel an announced action"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runCancel);

	withGlobals(program.command("action:default").description("declare the action in default: payment date + one series day passed, escrow short (anyone)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runDefault);

	withGlobals(program.command("action:strike").description("strike the record date (pauses the bond mint)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runStrike);

	withGlobals(program.command("action:snapshot").description("snapshot all holders (auto-batches of 8, idempotent)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runSnapshot);

	withGlobals(program.command("action:finalize-snapshot").description("finalize the snapshot (checks supply)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runFinalizeSnapshot);

	withGlobals(program.command("action:fund").description("fund the escrow (default: full requirement)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.option("--amount <minor>", "amount in minor units (default: net + tax + principal)")
		.action(runFund);

	withGlobals(program.command("action:pay").description("pay all holders (auto-batches of 10, idempotent)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runPay);

	withGlobals(program.command("action:complete").description("complete the action (resumes the mint, advances schedule)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runComplete);

	withGlobals(program.command("action:sweep").description("return a finished action's escrow to the issuer and close it (idempotent)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runSweep);
}
