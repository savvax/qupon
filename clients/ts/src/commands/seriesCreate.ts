/** `series:create` — mint + initialize a new bond series from CLI flags (run by POST /issuer/series). */
import { isAddress } from "@solana/kit";
import type { Command } from "commander";
import { ensureBondMint } from "../lib/bondMintFlow.js";
import { configPath, loadConfig, updateConfig } from "../lib/config.js";
import { createRpc, loadEnvFile } from "../lib/tx.js";
import { log, out, parseIntArg, signer, withGlobals, type GlobalOptions } from "./common.js";
import { initSeries } from "./series.js";

/** Terms for a new series, validated by {@link parseSeriesCreateArgs} (mirrored by POST /issuer/series). */
export interface SeriesTerms {
	name: string;
	isin: string;
	faceValue: bigint;
	couponRateBps: number;
	frequency: 1 | 2 | 4 | 12;
	dayCount: "THIRTY_360" | "ACT_365";
	issueDate: string;
	maturityDate: string;
	/** config value: "tKZT" | "USDC" (aliases) or a raw cash mint address (any registered cash asset). */
	cashMint: string;
	quorumBps: number;
	approvalBps: number;
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

function bpsRange(o: Record<string, string>, key: string, label: string): number {
	const n = parseIntArg(o[key] ?? "", label);
	if (n < 1 || n > 10000) throw new Error(`${label} must be 1..10000`);
	return n;
}

/** Validate series:create flags; throws a user-facing Error (same rules as the Go POST /issuer/series). */
export function parseSeriesCreateArgs(o: Record<string, string>): SeriesTerms {
	const name = o.name ?? "";
	if (!/^[A-Za-z0-9-]{1,16}$/.test(name)) throw new Error("name must be 1-16 characters of A-Z a-z 0-9 -");
	const isin = o.isin ?? "";
	if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) throw new Error("ISIN must be 12 characters: 2 letters, 9 alphanumerics, 1 check digit");
	const faceValue = BigInt(o.face ?? "");
	if (faceValue <= 0n) throw new Error("face must be > 0 minor units");
	const couponRateBps = bpsRange(o, "rateBps", "rate-bps");
	const fq = parseIntArg(o.frequency ?? "", "frequency");
	if (fq !== 1 && fq !== 2 && fq !== 4 && fq !== 12) throw new Error("frequency must be 1, 2, 4 or 12 per year");
	const dayCount = o.dayCount ?? "";
	if (dayCount !== "THIRTY_360" && dayCount !== "ACT_365") throw new Error("day count must be THIRTY_360 or ACT_365");
	const issueDate = o.issueDate ?? "";
	if (!YMD.test(issueDate)) throw new Error("issue date must be YYYY-MM-DD");
	const maturityDate = o.maturityDate ?? "";
	if (!YMD.test(maturityDate)) throw new Error("maturity date must be YYYY-MM-DD");
	if (Date.parse(maturityDate) <= Date.parse(issueDate)) throw new Error("maturity date must be after the issue date");
	if (o.cash && o.cashMint) throw new Error("pass --cash or --cash-mint, not both");
	let cashMint: string;
	if (o.cashMint) {
		if (!isAddress(o.cashMint)) throw new Error("cash-mint must be a base58 mint address");
		cashMint = o.cashMint;
	} else if (o.cash === "tkzt" || o.cash === "usdc") {
		cashMint = o.cash === "tkzt" ? "tKZT" : "USDC";
	} else throw new Error("cash must be tkzt or usdc (or pass --cash-mint <address>)");
	return {
		name, isin, faceValue, couponRateBps,
		frequency: fq as 1 | 2 | 4 | 12,
		dayCount: dayCount as "THIRTY_360" | "ACT_365",
		issueDate, maturityDate, cashMint,
		quorumBps: bpsRange({ ...o, quorumBps: o.quorumBps ?? "5000" }, "quorumBps", "quorum-bps"),
		approvalBps: bpsRange({ ...o, approvalBps: o.approvalBps ?? "6667" }, "approvalBps", "approval-bps"),
	};
}

/** Whole years between issue and maturity (config/devnet.json termYears), at least 1. */
function termYearsOf(issueDate: string, maturityDate: string): number {
	const days = (Date.parse(maturityDate) - Date.parse(issueDate)) / 86_400_000;
	return Math.max(1, Math.round(days / 365));
}

interface CreateOpts extends GlobalOptions {
	name: string;
	isin: string;
	face: string;
	rateBps: string;
	frequency: string;
	dayCount: string;
	issueDate: string;
	maturityDate: string;
	cash?: string;
	cashMint?: string;
	quorumBps?: string;
	approvalBps?: string;
	demoDaySecs?: string;
}

async function runSeriesCreate(opts: CreateOpts, cmd: Command): Promise<void> {
	const terms = parseSeriesCreateArgs({
		name: opts.name, isin: opts.isin, face: opts.face, rateBps: opts.rateBps, frequency: opts.frequency,
		dayCount: opts.dayCount, issueDate: opts.issueDate, maturityDate: opts.maturityDate,
		cash: opts.cash ?? "", cashMint: opts.cashMint ?? "",
		quorumBps: opts.quorumBps ?? "5000", approvalBps: opts.approvalBps ?? "6667",
	});
	loadEnvFile();
	const rpc = createRpc();
	const cfgPath = configPath();
	// 1 — write the config entry (mint empty) so ensureBondMint and the metadata fields see the terms.
	// updateConfig re-reads under a lock: never spread a `cfg` loaded at command start (task 91560).
	updateConfig(cfgPath, c => {
		const series = (c.series ?? {}) as Record<string, Record<string, unknown>>;
		series[terms.name] = {
			...(series[terms.name] ?? {}),
			mint: "",
			cashMint: terms.cashMint,
			isin: terms.isin,
			faceValue: Number(terms.faceValue),
			couponRateBps: terms.couponRateBps,
			frequency: terms.frequency,
			dayCount: terms.dayCount,
			termYears: termYearsOf(terms.issueDate, terms.maturityDate),
		};
		c.series = series;
	});
	// 2 — create the Token-2022 bond mint (idempotent)
	const bond = await ensureBondMint({ rpc, cfgPath, name: terms.name });
	// 3 — initialize the on-chain Series (reload: ensureBondMint wrote the mint)
	const registrar = await signer(cmd, "registrar");
	const init = await initSeries(
		rpc,
		loadConfig(cfgPath),
		terms.name,
		{
			issueDate: terms.issueDate,
			maturityDate: terms.maturityDate,
			quorumBps: terms.quorumBps,
			approvalBps: terms.approvalBps,
			...(opts.demoDaySecs !== undefined ? { demoDaySecs: parseIntArg(opts.demoDaySecs, "--demo-day-secs") } : {}),
		},
		registrar,
	);
	log(`series '${terms.name}' initialized (mint ${bond.mint}, ${init.seriesPda})`);
	out({ ok: true, series: terms.name, mint: bond.mint, signatures: [...bond.signatures, init.signature] });
}

export function registerSeriesCreateCommand(program: Command): void {
	withGlobals(program.command("series:create").description("create a bond series: config entry + Token-2022 mint + init_series"))
		.requiredOption("--name <n>", "series key written to config (1-16 chars A-Z a-z 0-9 -)")
		.requiredOption("--isin <12>", "ISIN (2 letters + 9 alphanumerics + check digit)")
		.requiredOption("--face <minor>", "face value in minor units (e.g. 100000 = 1,000.00 KZT)")
		.requiredOption("--rate-bps <n>", "coupon rate in bps (1000 = 10%)")
		.requiredOption("--frequency <1|2|4|12>", "coupons per year")
		.requiredOption("--day-count <THIRTY_360|ACT_365>", "day-count convention")
		.requiredOption("--issue-date <ymd>", "issue date YYYY-MM-DD")
		.requiredOption("--maturity-date <ymd>", "maturity date YYYY-MM-DD (after the issue date)")
		.option("--cash <tkzt|usdc>", "cash leg alias from config (tKZT or USDC)")
		.option("--cash-mint <address>", "cash leg mint address: any registered cash asset (KZTE, dKZT, …)")
		.option("--quorum-bps <n>", "bondholder-meeting quorum in bps", "5000")
		.option("--approval-bps <n>", "bondholder-meeting approval in bps", "6667")
		.option("--demo-day-secs <n>", "demo clock: seconds per civil day (1..86399), labelled DEMO; omit for the real clock")
		.action(runSeriesCreate);
}
