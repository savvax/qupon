/** `series:init` — initialize the on-chain Series for a name in config/devnet.json. */
import { address, type Address } from "@solana/kit";
import type { Command } from "commander";
import { getInitSeriesInstructionAsync } from "../generated/index.js";
import { seriesPda } from "../lib/pda.js";
import {
	almatyMidnight,
	dayCountCode,
	demoDates,
	initCtx,
	log,
	parseIntArg,
	padAscii,
	parseYmd,
	resolveCashMint,
	sendAndReport,
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

async function runInitSeries(opts: InitOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const sc = seriesConfig(cfg, opts.series);
	const mint = opts.mint !== undefined ? address(opts.mint) : address(sc.mint);
	const registrar = await signer(cmd, "registrar");
	const cashMint = resolveCashMint(cfg, sc.cashMint);
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	const demo = demoDates(opts.series);
	const issueDate = opts.issueDate ?? demo.issueDate;
	const maturityDate = opts.maturityDate ?? demo.maturityDate;
	if (issueDate === undefined || maturityDate === undefined) {
		throw new Error("--issue-date and --maturity-date are required (YYYY-MM-DD; no config/demo.json default)");
	}
	const instruction = await getInitSeriesInstructionAsync({
		registrar,
		mint,
		cashMint,
		cashTokenProgram,
		issuer: address(cfg.wallets.issuer),
		payingAgent: address(cfg.wallets.payingAgent),
		isin: padAscii(sc.isin, 12),
		ticker: padAscii(opts.series, 16),
		faceValue: BigInt(sc.faceValue),
		couponRateBps: sc.couponRateBps,
		frequency: sc.frequency,
		dayCount: dayCountCode(sc.dayCount),
		issueDate: almatyMidnight(parseYmd(issueDate, "--issue-date")),
		maturityDate: almatyMidnight(parseYmd(maturityDate, "--maturity-date")),
		quorumBps: parseIntArg(opts.quorumBps, "--quorum-bps"),
		approvalBps: parseIntArg(opts.approvalBps, "--approval-bps"),
	});
	const pda: Address = await seriesPda(mint);
	log(`initializing series '${opts.series}' (mint ${mint}, PDA ${pda})`);
	await sendAndReport(rpc, registrar, [instruction], "series:init", {
		series: opts.series,
		mint,
		seriesPda: pda,
	});
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
