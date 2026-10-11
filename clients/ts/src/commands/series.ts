/** `series:init` — initialize the on-chain Series for a name in config/devnet.json. */
import { address, type Address, type Base64EncodedBytes, type Instruction, type KeyPairSigner, type Signature, getBase64Decoder, getBase64Encoder, type ReadonlyUint8Array } from "@solana/kit";
import { fetchMaybeMint } from "@solana-program/token-2022";
import { Option, type Command } from "commander";
import { getInitHookInstructionAsync, getInitSeriesInstructionAsync, QUPON_BONDS_PROGRAM_ADDRESS, SERIES_DISCRIMINATOR, getSeriesDecoder, type Series } from "../generated/index.js";
import { CivilClock, demoAnchor } from "../lib/clock.js";
import { packYmd } from "../lib/daycount.js";
import { mintIsHooked } from "../lib/hook.js";
import { seriesPda } from "../lib/pda.js";
import type { QuponConfig } from "../lib/config.js";
import type { QuponRpc } from "../lib/tx.js";
import {
	almatyMidnight,
	dayCountCode,
	demoDates,
	initCtx,
	log,
	out,
	padAscii,
	parseIntArg,
	parseYmd,
	resolveCashMint,
	sendQuiet,
	seriesConfig,
	signer,
	tokenProgramOfMint,
	withGlobals,
	type GlobalOptions,
} from "./common.js";

interface InitOpts extends GlobalOptions {
	series: string;
	mint?: string;
	issueDate?: string;
	maturityDate?: string;
	quorumBps: string;
	approvalBps: string;
	payingAgent?: string;
	demoDaySecs?: string;
}

export interface InitSeriesOpts {
	issueDate: string;
	maturityDate: string;
	quorumBps: number;
	approvalBps: number;
	/** Bond mint override (default: the config value — series:create reloads the config after ensureBondMint). */
	mint?: Address;
	/** Paying-agent override (default: cfg.wallets.payingAgent), e.g. a Squads vault PDA. */
	payingAgent?: Address;
	/** Demo clock: seconds per civil day, 1..86 399 (plan 15 D7); omit or 0 = the real Almaty clock. */
	demoDaySecs?: number;
}

/** Build and send init_series; returns the tx report without printing (shared with series:create). */
export async function initSeries(
	rpc: QuponRpc,
	cfg: QuponConfig,
	name: string,
	opts: InitSeriesOpts,
	registrar: KeyPairSigner,
): Promise<{ signature: Signature; slot: bigint; seriesPda: Address }> {
	const sc = seriesConfig(cfg, name);
	const mint = opts.mint ?? address(sc.mint);
	const cashMint = resolveCashMint(cfg, sc.cashMint);
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	// Real clock: Almaty midnights, issue_ymd derived on-chain. Demo clock: the calendar mirrors the real
	// civil calendar compressed — TODAY maps to now (lib/clock.ts demoAnchor), so a backdated --issue-date is
	// an honest "issued N demo-days ago" (the sandbox lands its first coupon seconds after create, task
	// 91574) — and the maturity comes from the same clock the program uses (plan 15 D7).
	const daySecs = opts.demoDaySecs ?? 0;
	const issueYmd = parseYmd(opts.issueDate, "--issue-date");
	const maturityYmd = parseYmd(opts.maturityDate, "--maturity-date");
	let issueDate = almatyMidnight(issueYmd);
	let maturityDate = almatyMidnight(maturityYmd);
	if (daySecs > 0) {
		const nowSecs = Math.floor(Date.now() / 1000);
		issueDate = BigInt(demoAnchor(daySecs, nowSecs, issueYmd));
		maturityDate = BigInt(CivilClock.demo(daySecs, Number(issueDate), issueYmd).ts(maturityYmd));
		log(`demo clock: 1 day = ${daySecs}s, maturity in ${maturityDate - issueDate}s`);
	}
	const instruction = await getInitSeriesInstructionAsync({
		registrar,
		mint,
		cashMint,
		cashTokenProgram,
		issuer: address(cfg.wallets.issuer),
		payingAgent: opts.payingAgent ?? address(cfg.wallets.payingAgent),
		isin: padAscii(sc.isin, 12),
		ticker: padAscii(name, 16),
		faceValue: BigInt(sc.faceValue),
		couponRateBps: sc.couponRateBps,
		frequency: sc.frequency,
		dayCount: dayCountCode(sc.dayCount),
		issueDate,
		maturityDate,
		daySecs,
		issueYmd: daySecs > 0 ? packYmd(issueYmd) : 0,
		quorumBps: opts.quorumBps,
		approvalBps: opts.approvalBps,
	});
	const pda: Address = await seriesPda(mint);
	const instructions: Instruction[] = [instruction];
	// Hooked mint (plan 15 D1'): arm the transfer-hook gate right after init_series — same tx, same registrar.
	const mintAccount = await fetchMaybeMint(rpc, mint);
	if (mintAccount.exists && mintIsHooked(mintAccount.data)) {
		instructions.push(await getInitHookInstructionAsync({ registrar, series: pda, mint }));
		log("mint is hooked — init_hook arms the record-date gate (plan 15 D1')");
	}
	log(`initializing series '${name}' (mint ${mint}, PDA ${pda})`);
	const report = await sendQuiet(rpc, registrar, instructions, "series:init");
	return { signature: report.signature, slot: report.slot, seriesPda: pda };
}

async function runInitSeries(opts: InitOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const sc = seriesConfig(cfg, opts.series);
	const mint = opts.mint !== undefined ? address(opts.mint) : address(sc.mint);
	const demo = demoDates(opts.series);
	const issueDate = opts.issueDate ?? demo.issueDate;
	const maturityDate = opts.maturityDate ?? demo.maturityDate;
	if (issueDate === undefined || maturityDate === undefined) {
		throw new Error("--issue-date and --maturity-date are required (YYYY-MM-DD; no config/demo.json default)");
	}
	const registrar = await signer(cmd, "registrar");
	const report = await initSeries(rpc, cfg, opts.series, {
		issueDate,
		maturityDate,
		quorumBps: parseIntArg(opts.quorumBps, "--quorum-bps"),
		approvalBps: parseIntArg(opts.approvalBps, "--approval-bps"),
		mint,
		...(opts.payingAgent !== undefined ? { payingAgent: address(opts.payingAgent) } : {}),
		...(opts.demoDaySecs !== undefined ? { demoDaySecs: parseIntArg(opts.demoDaySecs, "--demo-day-secs") } : {}),
	}, registrar);
	out({ ok: true, signature: report.signature, slot: report.slot, series: opts.series, mint, seriesPda: report.seriesPda });
}

const SERIES_STATUS_NAMES = ["active", "matured", "retiring", "closed"] as const;

/** The JSON row `series:list` prints per on-chain series (ticker/isin NUL-trimmed ASCII). */
export interface SeriesRow {
	readonly pda: Address;
	readonly mint: Address;
	readonly ticker: string;
	readonly isin: string;
	readonly status: string;
	readonly daySecs: number;
	readonly hookGate: boolean;
	readonly actionCount: number;
	readonly issueDate: bigint;
	readonly maturityDate: bigint;
}

export type SeriesStatusFilter = "active" | "closed" | "all";

function ascii(bytes: ReadonlyUint8Array): string {
	return new TextDecoder().decode(bytes).replace(/\0+$/, "");
}

/** Series account → the `series:list` row. */
export function toSeriesRow(pda: Address, s: Series): SeriesRow {
	return {
		pda,
		mint: s.mint,
		ticker: ascii(s.ticker),
		isin: ascii(s.isin),
		status: SERIES_STATUS_NAMES[s.status] ?? `unknown(${s.status})`,
		daySecs: s.daySecs,
		hookGate: s.hook === 1,
		actionCount: s.actionCount,
		issueDate: s.issueDate,
		maturityDate: s.maturityDate,
	};
}

/** Keep active/closed/all (± demo-clock only), then sort by ticker (PDA tiebreak — deterministic). */
export function filterSeriesRows(
	rows: readonly SeriesRow[],
	status: SeriesStatusFilter,
	demo: boolean,
): SeriesRow[] {
	return rows
		.filter(r => (status === "all" || r.status === status) && (!demo || r.daySecs > 0))
		.sort((a, b) => (a.ticker === b.ticker ? a.pda.localeCompare(b.pda) : a.ticker.localeCompare(b.ticker)));
}

/**
 * Every on-chain Series via getProgramAccounts. Discriminator memcmp only — no dataSize filter and
 * no zero-padding assumption: accounts whose open_action went Some → None keep a stale 32-byte
 * tail, and the Codama decoder reads the shifted tail fields and ignores the leftovers.
 */
export async function listSeries(rpc: QuponRpc): Promise<SeriesRow[]> {
	const b64 = getBase64Decoder();
	const memcmp = {
		memcmp: { bytes: b64.decode(SERIES_DISCRIMINATOR) as Base64EncodedBytes, encoding: "base64" as const, offset: 0n },
	};
	const res = await rpc
		.getProgramAccounts(QUPON_BONDS_PROGRAM_ADDRESS, { commitment: "confirmed", encoding: "base64", filters: [memcmp] })
		.send();
	const decoder = getSeriesDecoder();
	const b64ToBytes = getBase64Encoder();
	return res.map(item => {
		const [encoded] = item.account.data;
		if (encoded === undefined) throw new Error(`empty account data for ${item.pubkey}`);
		return toSeriesRow(item.pubkey, decoder.decode(b64ToBytes.encode(encoded)));
	});
}

interface ListOpts extends GlobalOptions {
	status: SeriesStatusFilter;
	demo: boolean;
}

async function runSeriesList(opts: ListOpts, cmd: Command): Promise<void> {
	const { rpc } = await initCtx(cmd);
	const rows = filterSeriesRows(await listSeries(rpc), opts.status, opts.demo);
	log(`series:list: ${rows.length} series (${opts.status}${opts.demo ? ", demo clock only" : ""})`);
	out({ ok: true, series: rows });
}

export function registerSeriesCommands(program: Command): void {
	withGlobals(
		program
			.command("series:init")
			.description("initialize the on-chain Series from a config/devnet.json entry"),
	)
		.requiredOption("--series <name>", "key in the config/devnet.json series object")
		.option("--mint <address>", "bond mint (default: config value)")
		.option("--issue-date <ymd>", "issue date YYYY-MM-DD (default: config/demo.json)")
		.option("--maturity-date <ymd>", "maturity date YYYY-MM-DD (default: config/demo.json)")
		.option("--quorum-bps <n>", "bondholder-meeting quorum in bps", "5000")
		.option("--approval-bps <n>", "bondholder-meeting approval in bps", "6667")
		.option("--paying-agent <address>", "paying agent (default: config wallets.payingAgent), e.g. a Squads vault")
		.option("--demo-day-secs <n>", "demo clock: seconds per civil day (1..86399), labelled DEMO; omit for the real clock")
		.action(runInitSeries);

	withGlobals(program.command("series:list").description("list every on-chain series, sorted by ticker"))
		.addOption(new Option("--status <s>", "keep only these series").choices(["active", "closed", "all"]).default("all"))
		.option("--demo", "demo-clock series only (day_secs > 0)")
		.action(runSeriesList);
}
