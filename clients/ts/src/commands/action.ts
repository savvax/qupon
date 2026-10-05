/**
 * `action:*` — the corporate-action lifecycle (INTR coupon flow): announce,
 * cancel, strike, snapshot (auto-batched), finalize, fund, pay (auto-batched),
 * complete. Batching is deterministic: holders sorted by owner pubkey ascending
 * (the snapshot-hash order), then fixed-size chunks sent sequentially.
 */
import { isSome, type Address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import type { Command } from "commander";
import {
	fetchCorporateAction,
	type CorporateAction,
	getAnnounceActionInstructionAsync,
	getCancelActionInstruction,
	getCompleteActionInstruction,
	getFinalizeSnapshotInstruction,
	getFundActionInstruction,
	getPayBatchInstruction,
	getSnapshotBatchInstruction,
	getStrikeRecordInstruction,
} from "../generated/index.js";
import { chunk, sortByOwner } from "../lib/batch.js";
import { accrualDays, dayCountFromCode, packYmd } from "../lib/daycount.js";
import { txLink } from "../lib/explorer.js";
import { actionPda, entitlementPda } from "../lib/pda.js";
import type { QuponRpc } from "../lib/tx.js";
import {
	almatyDate,
	initCtx,
	listEntitlements,
	listInvestors,
	loadSeries,
	log,
	out,
	parseAt,
	parseBigInt,
	parseIntArg,
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

/** Resolve the working action: --index, else the series' open action. */
async function loadAction(
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
}

async function runAnnounce(opts: AnnounceOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const s = info.account;
	// INTR: the period is the current coupon period and the rate is a series term
	// (checked on-chain: period_start == Series.period_start, end == next_coupon_date).
	const periodStart = s.periodStart;
	const periodEnd = s.nextCouponDate;
	const startYmd = almatyDate(periodStart);
	const endYmd = almatyDate(periodEnd);
	const days = accrualDays(dayCountFromCode(s.dayCount), startYmd, endYmd);
	const recordAt = parseAt(opts.recordAt, "--record-at");
	const paymentAt = parseAt(opts.paymentAt, "--payment-at");
	const index = s.actionCount;
	const corpId =
		opts.corpId ?? `${info.name}-INTR-${String(index + 1).padStart(4, "0")}`; // e.g. QPNb1-INTR-0001
	const action = await actionPda(info.pda, index);
	log(`announcing INTR #${index} (${corpId}): ${days} accrual days, period ${periodStart} → ${periodEnd}`);
	const instruction = await getAnnounceActionInstructionAsync({
		authority: registrar,
		series: info.pda,
		action,
		cashMint: s.cashMint,
		cashTokenProgram: await tokenProgramOfMint(rpc, s.cashMint),
		kind: 0, // Interest
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
		factorBps: 0,
		proposalNewRateBps: 0,
		proposalNewMaturity: 0n,
		votingEndsAt: 0n,
	});
	await sendAndReport(rpc, registrar, [instruction], "action:announce", {
		action,
		index,
		corpId,
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

async function runSnapshot(opts: ActionOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar") /* registrar or paying agent are both valid operators */;
	const { action } = await loadAction(rpc, info, opts.index);
	const investors = await listInvestors(rpc, info.pda);
	const batches = sortedBatches(investors, h => h.owner, SNAPSHOT_BATCH_MAX);
	log(`snapshotting ${investors.length} holders in ${batches.length} batch(es) of ≤ ${SNAPSHOT_BATCH_MAX}`);
	const results: (TxReport & { holders: number })[] = [];
	for (const [i, batch] of batches.entries()) {
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
		results.push({ ...report, holders: batch.length });
	}
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
	const batches = sortedBatches(payable, h => h.owner, PAY_BATCH_MAX);
	log(`paying ${payable.length} holder(s) in ${batches.length} batch(es) of ≤ ${PAY_BATCH_MAX}`);
	const results: (TxReport & { holders: number })[] = [];
	for (const [i, batch] of batches.entries()) {
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
		const report = await sendQuiet(rpc, authority, [instruction], `action:pay batch ${i + 1}/${batches.length}`);
		log(`  batch ${i + 1}/${batches.length}: ${report.signature} (${txLink(report.signature)})`);
		results.push({ ...report, holders: batch.length });
	}
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

const indexOpt = "--index <n>" as const;

export function registerActionCommands(program: Command): void {
	withGlobals(program.command("action:announce").description("announce an INTR (coupon) action for the current period"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--record-at <ts>", "record date: unix ts or +seconds from now")
		.requiredOption("--payment-at <ts>", "payment date: unix ts or +seconds from now")
		.option("--corp-id <id>", "CORP id (default: <series>-INTR-####)")
		.option("--official-id <id>", "COAF id assigned by KASE (optional)")
		.action(runAnnounce);

	withGlobals(program.command("action:cancel").description("cancel an announced action"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option(indexOpt, "action index (default: the open action)")
		.action(runCancel);

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
}
