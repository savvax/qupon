/** `investor:register`, `investor:suspend`, `subscribe`, `issue` — the issuance flow. */
import { address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import type { Command } from "commander";
import {
	fetchInvestor,
	getIssueUnitsInstruction,
	getRegisterInvestorInstructionAsync,
	getReinstateInvestorInstruction,
	getSubscribeInstructionAsync,
	getSuspendInvestorInstruction,
} from "../generated/index.js";
import { kycAttestationPda, kycRef } from "../lib/kyc.js";
import { investorPda } from "../lib/pda.js";
import {
	initCtx,
	loadSeries,
	log,
	parseBigInt,
	parseIntArg,
	sendAndReport,
	signer,
	tokenProgramOfMint,
	withGlobals,
	type GlobalOptions,
} from "./common.js";

interface RegisterOpts extends GlobalOptions {
	series: string;
	owner: string;
	type: string;
	residency: string;
	taxBps: string;
}

async function runRegister(opts: RegisterOpts, cmd: Command): Promise<void> {
	if (opts.type !== "individual" && opts.type !== "legal_entity") {
		throw new Error("--type must be individual or legal_entity");
	}
	if (opts.residency !== "resident" && opts.residency !== "nonresident") {
		throw new Error("--residency must be resident or nonresident");
	}
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const owner = address(opts.owner);
	const cashMint = info.account.cashMint;
	const instruction = await getRegisterInvestorInstructionAsync({
		registrar,
		series: info.pda,
		owner,
		// The KYC provider's SAS attestation for this wallet; attributes below must equal the attested ones.
		kycAttestation: await kycAttestationPda(owner),
		mint: info.mint,
		cashMint,
		cashTokenProgram: await tokenProgramOfMint(rpc, cashMint),
		investorType: opts.type === "individual" ? 0 : 1, // 0 Individual, 1 Legal
		residency: opts.residency === "resident" ? 0 : 1, // 0 Resident, 1 NonResident
		taxRateBps: parseIntArg(opts.taxBps, "--tax-bps"),
		kycRef: await kycRef(owner),
	});
	const investor = await investorPda(info.pda, owner);
	await sendAndReport(rpc, registrar, [instruction], "investor:register", { investor, owner });
}

interface SuspendOpts extends GlobalOptions {
	series: string;
	owner: string;
}

async function runSuspend(opts: SuspendOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const owner = address(opts.owner);
	const investor = await investorPda(info.pda, owner);
	const bondAta = (await fetchInvestor(rpc, investor)).data.bondAta;
	const instruction = getSuspendInvestorInstruction({
		registrar,
		series: info.pda,
		investor,
		mint: info.mint,
		bondAta,
	});
	await sendAndReport(rpc, registrar, [instruction], "investor:suspend", { investor, owner });
}

async function runReinstate(opts: SuspendOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const owner = address(opts.owner);
	const investor = await investorPda(info.pda, owner);
	const bondAta = (await fetchInvestor(rpc, investor)).data.bondAta;
	const instruction = getReinstateInvestorInstruction({
		registrar,
		series: info.pda,
		investor,
		mint: info.mint,
		bondAta,
		bondTokenProgram: await tokenProgramOfMint(rpc, info.mint),
	});
	await sendAndReport(rpc, registrar, [instruction], "investor:reinstate", { investor, owner });
}

interface SubscribeOpts extends GlobalOptions {
	series: string;
	units: string;
	price?: string;
}

async function runSubscribe(opts: SubscribeOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const owner = await signer(cmd, "investor");
	const investor = await investorPda(info.pda, owner.address);
	const record = (await fetchInvestor(rpc, investor)).data;
	const cashMint = info.account.cashMint;
	const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
	const issuerCash = (
		await findAssociatedTokenPda({ owner: info.account.issuer, tokenProgram: cashTokenProgram, mint: cashMint })
	)[0];
	if ((await rpc.getAccountInfo(issuerCash, { encoding: "base64" }).send()).value === null) {
		throw new Error(`issuer cash account ${issuerCash} does not exist — create the issuer's ATA for ${cashMint} first`);
	}
	const price = opts.price !== undefined ? parseBigInt(opts.price, "--price") : info.account.faceValue;
	const units = parseBigInt(opts.units, "--units");
	log(`subscribing ${units} units at ${price} minor units each (DvP: cash → issuer, mint → investor)`);
	const instruction = await getSubscribeInstructionAsync({
		owner,
		series: info.pda,
		mint: info.mint,
		bondAta: record.bondAta,
		cashMint,
		cashAta: record.cashAta,
		issuerCash,
		cashTokenProgram,
		units,
		pricePerUnit: price,
	});
	await sendAndReport(rpc, owner, [instruction], "subscribe", { investor, units, pricePerUnit: price });
}

interface IssueOpts extends GlobalOptions {
	series: string;
	owner: string;
	units: string;
}

async function runIssue(opts: IssueOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const issuer = await signer(cmd, "issuer");
	const owner = address(opts.owner);
	const investor = await investorPda(info.pda, owner);
	const bondAta = (await fetchInvestor(rpc, investor)).data.bondAta;
	const units = parseBigInt(opts.units, "--units");
	const instruction = getIssueUnitsInstruction({
		issuer,
		series: info.pda,
		investor,
		mint: info.mint,
		bondAta,
		units,
	});
	await sendAndReport(rpc, issuer, [instruction], "issue", { investor, owner, units });
}

export function registerInvestorCommands(program: Command): void {
	withGlobals(program.command("investor:register").description("register an investor (requires the KYC provider's SAS attestation: kyc:attest)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--owner <address>", "investor wallet")
		.option("--type <t>", "individual | legal_entity", "individual")
		.option("--residency <r>", "resident | nonresident", "resident")
		.option("--tax-bps <n>", "withholding tax in bps", "0")
		.action(runRegister);

	withGlobals(program.command("investor:suspend").description("suspend an investor (freezes the bond ATA)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--owner <address>", "investor wallet")
		.action(runSuspend);

	withGlobals(program.command("investor:reinstate").description("reinstate a suspended investor (thaws the bond ATA)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--owner <address>", "investor wallet")
		.action(runReinstate);

	withGlobals(program.command("subscribe").description("placement at par: pay cash, receive bonds (investor signs)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--units <n>", "units to subscribe (1 token = 1 bond)")
		.option("--price <minor>", "price per unit in minor units (default: face value — par only)")
		.action(runSubscribe);

	withGlobals(program.command("issue").description("issue units without cash (free allocation, issuer signs)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--owner <address>", "investor wallet")
		.requiredOption("--units <n>", "units to issue")
		.action(runIssue);
}
