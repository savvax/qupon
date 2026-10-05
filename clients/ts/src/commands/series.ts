/** `series:init` — initialize the on-chain Series for a name in config/devnet.json. */
import { address, type Address, type KeyPairSigner, type Signature } from "@solana/kit";
import type { Command } from "commander";
import { getInitSeriesInstructionAsync } from "../generated/index.js";
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
}

export interface InitSeriesOpts {
	issueDate: string;
	maturityDate: string;
	quorumBps: number;
	approvalBps: number;
	/** Bond mint override (default: the config value — series:create reloads the config after ensureBondMint). */
	mint?: Address;
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
	const instruction = await getInitSeriesInstructionAsync({
		registrar,
		mint,
		cashMint,
		cashTokenProgram,
		issuer: address(cfg.wallets.issuer),
		payingAgent: address(cfg.wallets.payingAgent),
		isin: padAscii(sc.isin, 12),
		ticker: padAscii(name, 16),
		faceValue: BigInt(sc.faceValue),
		couponRateBps: sc.couponRateBps,
		frequency: sc.frequency,
		dayCount: dayCountCode(sc.dayCount),
		issueDate: almatyMidnight(parseYmd(opts.issueDate, "--issue-date")),
		maturityDate: almatyMidnight(parseYmd(opts.maturityDate, "--maturity-date")),
		quorumBps: opts.quorumBps,
		approvalBps: opts.approvalBps,
	});
	const pda: Address = await seriesPda(mint);
	log(`initializing series '${name}' (mint ${mint}, PDA ${pda})`);
	const report = await sendQuiet(rpc, registrar, [instruction], "series:init");
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
	}, registrar);
	out({ ok: true, signature: report.signature, slot: report.slot, series: opts.series, mint, seriesPda: report.seriesPda });
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
		.action(runInitSeries);
}
