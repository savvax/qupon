/**
 * Redemption tail and bondholder meeting: `action:retire`, `series:close`, `meeting:announce`, `vote`,
 * `meeting:finalize`, `meeting:apply`. Cash-kind announcements (REDM/MCAL/PCAL) live in `action:announce --kind`.
 */
import type { Address } from "@solana/kit";
import type { Command } from "commander";
import {
	getAnnounceActionInstructionAsync,
	getApplyTermsChangeInstruction,
	getCastVoteInstructionAsync,
	getCloseSeriesInstruction,
	getFinalizeMeetingInstruction,
	getRetireBatchInstruction,
} from "../generated/index.js";
import { chunk, sortByOwner } from "../lib/batch.js";
import { txLink } from "../lib/explorer.js";
import { actionPda } from "../lib/pda.js";
import { loadAction } from "./action.js";
import {
	defaultCorpId,
	almatyMidnight,
	initCtx,
	listEntitlements,
	listInvestors,
	loadSeries,
	log,
	out,
	padAscii,
	parseAt,
	parseIntArg,
	parseYmd,
	sendAndReport,
	sendQuiet,
	signer,
	tokenProgramOfMint,
	withGlobals,
	wr,
	type GlobalOptions,
	type ListedEntitlement,
	type ListedInvestor,
	type TxReport,
} from "./common.js";

/** On-chain max pairs per retire_batch (docs/02 batch sizing): 12 pairs = 24 keys + 5 fixed — fits a tx. */
export const RETIRE_BATCH_MAX = 12;

export interface RetirePair {
	readonly owner: Address;
	/** Entitlement PDA, or the Investor PDA for an orphan (units received after the resume, no entitlement). */
	readonly first: Address;
	readonly bondAta: Address;
	readonly orphan: boolean;
}

/**
 * Pairs for `retire_batch`: every not-yet-Retired entitlement, plus [Investor, bond ATA] for registered wallets that
 * hold units but have no entitlement (so nobody can block `series:close`). Owner-ascending.
 */
export function retirePairs(
	entitlements: readonly Pick<ListedEntitlement, "address" | "owner" | "status">[],
	investors: readonly Pick<ListedInvestor, "address" | "owner" | "bondAta">[],
	bondBalance: ReadonlyMap<string, bigint>,
): RetirePair[] {
	const byOwner = new Map(investors.map(i => [i.owner as string, i]));
	const entitled = new Set(entitlements.map(e => e.owner as string));
	const pairs: RetirePair[] = [];
	for (const e of entitlements) {
		if (e.status === 2) continue; // Retired
		const inv = byOwner.get(e.owner);
		if (inv === undefined) throw new Error(`no Investor PDA for entitlement owner ${e.owner}`);
		pairs.push({ owner: e.owner, first: e.address, bondAta: inv.bondAta, orphan: false });
	}
	for (const inv of investors) {
		if (entitled.has(inv.owner) || (bondBalance.get(inv.bondAta) ?? 0n) === 0n) continue;
		pairs.push({ owner: inv.owner, first: inv.address, bondAta: inv.bondAta, orphan: true });
	}
	return sortByOwner(pairs, p => p.owner);
}

/** `vote --choice` → on-chain VoteChoice. */
export function voteChoice(s: string): number {
	const c = { for: 1, against: 2, abstain: 3 }[s.toLowerCase()];
	if (c === undefined) throw new Error(`--choice must be for|against|abstain, got '${s}'`);
	return c;
}

interface SeriesOpts extends GlobalOptions {
	series: string;
	index?: string;
}

async function runRetire(opts: SeriesOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const authority = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const [investors, entitlements] = await Promise.all([listInvestors(rpc, info.pda), listEntitlements(rpc, action)]);
	const entitled = new Set(entitlements.map(e => e.owner as string));
	const balances = new Map<string, bigint>();
	for (const inv of investors.filter(i => !entitled.has(i.owner))) {
		try {
			balances.set(inv.bondAta, BigInt((await rpc.getTokenAccountBalance(inv.bondAta).send()).value.amount));
		} catch {
			balances.set(inv.bondAta, 0n);
		}
	}
	const pairs = retirePairs(entitlements, investors, balances);
	const batches = chunk(pairs, RETIRE_BATCH_MAX);
	log(`retiring ${pairs.length} account(s) (${pairs.filter(p => p.orphan).length} orphan) in ${batches.length} batch(es) of ≤ ${RETIRE_BATCH_MAX}`);
	const results: (TxReport & { pairs: number })[] = [];
	for (const [i, batch] of batches.entries()) {
		const base = getRetireBatchInstruction({ authority, series: info.pda, action, mint: info.mint });
		const metas = batch.flatMap(p => [wr(p.first), wr(p.bondAta)]);
		const report = await sendQuiet(rpc, authority, [{ ...base, accounts: [...base.accounts, ...metas] }], `action:retire batch ${i + 1}/${batches.length}`);
		log(`  batch ${i + 1}/${batches.length}: ${report.signature} (${txLink(report.signature)})`);
		results.push({ ...report, pairs: batch.length });
	}
	out({ ok: true, action, batches: results.length, pairs: pairs.length, results });
}

async function runClose(opts: SeriesOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getCloseSeriesInstruction({ registrar, series: info.pda, action, mint: info.mint });
	await sendAndReport(rpc, registrar, [instruction], "series:close", { action, mint: info.mint });
}

interface MeetingOpts extends GlobalOptions {
	series: string;
	recordAt: string;
	votingEndsAt: string;
	newRateBps?: string;
	newMaturity?: string;
	corpId?: string;
	officialId?: string;
}

async function runMeetingAnnounce(opts: MeetingOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const issuer = await signer(cmd, "issuer");
	const s = info.account;
	const newRate = opts.newRateBps === undefined ? 0 : parseIntArg(opts.newRateBps, "--new-rate-bps");
	const newMaturity = opts.newMaturity === undefined ? 0n : almatyMidnight(parseYmd(opts.newMaturity, "--new-maturity"));
	if (newRate === 0 && newMaturity === 0n) throw new Error("propose --new-rate-bps and/or --new-maturity");
	const recordAt = parseAt(opts.recordAt, "--record-at");
	const votingEndsAt = parseAt(opts.votingEndsAt, "--voting-ends-at");
	const index = s.actionCount;
	const corpId = opts.corpId ?? defaultCorpId(info.name, "BMET", index + 1);
	const action = await actionPda(info.pda, index);
	log(`announcing BMET #${index} (${corpId}): rate ${s.couponRateBps} → ${newRate || "unchanged"} bps; voting until ${votingEndsAt}`);
	const instruction = await getAnnounceActionInstructionAsync({
		authority: issuer,
		series: info.pda,
		action,
		cashMint: s.cashMint,
		cashTokenProgram: await tokenProgramOfMint(rpc, s.cashMint),
		kind: 4, // Meeting
		mandatory: 1, // VOLU
		corpId: padAscii(corpId, 16),
		officialId: padAscii(opts.officialId ?? "", 16),
		recordAt,
		paymentAt: recordAt, // no cash leg; ordering record ≤ payment
		periodStartYmd: 0,
		periodEndYmd: 0,
		periodStartTs: 0n,
		periodEndTs: 0n,
		accrualDays: 0,
		rateBps: 0,
		factorBps: 0,
		proposalNewRateBps: newRate,
		proposalNewMaturity: newMaturity,
		votingEndsAt,
	});
	await sendAndReport(rpc, issuer, [instruction], "meeting:announce", { action, index, corpId, recordAt, votingEndsAt, proposalNewRateBps: newRate });
}

interface VoteOpts extends SeriesOpts {
	choice: string;
}

async function runVote(opts: VoteOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const owner = await signer(cmd, "investor");
	const choice = voteChoice(opts.choice);
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = await getCastVoteInstructionAsync({ owner, series: info.pda, action, choice });
	await sendAndReport(rpc, owner, [instruction], "vote", { action, owner: owner.address, choice: opts.choice.toLowerCase() });
}

async function runMeetingFinalize(opts: SeriesOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getFinalizeMeetingInstruction({ registrar, series: info.pda, action });
	await sendAndReport(rpc, registrar, [instruction], "meeting:finalize", { action });
}

async function runMeetingApply(opts: SeriesOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const instruction = getApplyTermsChangeInstruction({ registrar, series: info.pda, action, mint: info.mint });
	// The registrar's signature stands in for the regulator (ARDFM) registration — SIMULATED.
	await sendAndReport(rpc, registrar, [instruction], "meeting:apply", { action, regulatorRegistration: "SIMULATED" });
}

export function registerLifecycleCommands(program: Command): void {
	const series = (c: Command): Command =>
		c.requiredOption("--series <name>", "series name in config/devnet.json").option("--index <n>", "action index (default: the open action)");

	series(withGlobals(program.command("action:retire").description("burn redeemed units (auto-batches of 12, idempotent; includes orphan units)"))).action(runRetire);
	series(withGlobals(program.command("series:close").description("close the series after retirement (metadata REDEEMED, mint closed)"))).action(runClose);
	withGlobals(program.command("meeting:announce").description("issuer announces a bondholder meeting (BMET) proposing new terms"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--record-at <ts>", "record date: unix ts or +seconds from now")
		.requiredOption("--voting-ends-at <ts>", "end of voting: unix ts or +seconds from now")
		.option("--new-rate-bps <n>", "proposed coupon rate in bps")
		.option("--new-maturity <ymd>", "proposed maturity YYYY-MM-DD")
		.option("--corp-id <id>", "CORP id, ≤ 16 bytes (default: <series>-BMET-####)")
		.option("--official-id <id>", "COAF id assigned by KASE (optional)")
		.action(runMeetingAnnounce);
	series(withGlobals(program.command("vote").description("cast a snapshot-weighted vote (investor keypair)")))
		.requiredOption("--choice <c>", "for | against | abstain")
		.action(runVote);
	series(withGlobals(program.command("meeting:finalize").description("close voting: quorum/approval → Approved/Rejected/NoQuorum"))).action(runMeetingFinalize);
	series(withGlobals(program.command("meeting:apply").description("apply an approved proposal (ARDFM registration SIMULATED)"))).action(runMeetingApply);
}
