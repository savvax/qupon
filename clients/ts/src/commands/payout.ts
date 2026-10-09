/**
 * Holder-chosen payout route (plan 15 D6): `payout:route` (the holder's own signature: wallet or bank) and
 * `payout:confirm-bank` (the paying agent confirms a bank-routed payout with the transfer reference).
 * Bank details and references never go on-chain in clear: only their sha256.
 */
import { createHash } from "node:crypto";
import type { Command } from "commander";
import { address } from "@solana/kit";
import { getConfirmBankPayoutInstruction, getSetPayoutRouteInstruction } from "../generated/index.js";
import { entitlementPda, investorPda, routePda } from "../lib/pda.js";
import { loadAction } from "./action.js";
import { initCtx, loadSeries, sendAndReport, signer, withGlobals, type GlobalOptions } from "./common.js";

/** sha256 of a UTF-8 text as the 32-byte array the program stores. */
export function sha256Bytes(text: string): Uint8Array {
	return new Uint8Array(createHash("sha256").update(text, "utf8").digest());
}

interface RouteOpts extends GlobalOptions {
	series: string;
	route: string;
	bankRef?: string;
}

async function runRoute(opts: RouteOpts, cmd: Command): Promise<void> {
	const route = opts.route === "bank" ? 1 : opts.route === "wallet" ? 0 : -1;
	if (route < 0) throw new Error("--route must be wallet or bank");
	if (route === 1 && (opts.bankRef === undefined || opts.bankRef.trim() === "")) throw new Error("--bank-ref is required for the bank route");
	if (route === 0 && opts.bankRef !== undefined) throw new Error("--bank-ref only applies to the bank route");
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const owner = await signer(cmd, "investor");
	const investor = await investorPda(info.pda, owner.address);
	const bankRefHash = route === 1 ? sha256Bytes(opts.bankRef ?? "") : new Uint8Array(32);
	const instruction = getSetPayoutRouteInstruction({
		owner,
		series: info.pda,
		investor,
		route: await routePda(investor),
		routeArg: route,
		bankRefHash,
	});
	await sendAndReport(rpc, owner, [instruction], "payout:route", {
		route: opts.route,
		bankRefHash: Buffer.from(bankRefHash).toString("hex"),
	});
}

interface ConfirmOpts extends GlobalOptions {
	series: string;
	index?: string;
	owner: string;
	reference: string;
}

async function runConfirm(opts: ConfirmOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const payingAgent = await signer(cmd, "payingAgent");
	const { action } = await loadAction(rpc, info, opts.index);
	const referenceHash = sha256Bytes(opts.reference);
	const instruction = getConfirmBankPayoutInstruction({
		payingAgent,
		series: info.pda,
		action,
		entitlement: await entitlementPda(action, address(opts.owner)),
		referenceHash,
	});
	await sendAndReport(rpc, payingAgent, [instruction], "payout:confirm-bank", {
		action,
		owner: opts.owner,
		referenceHash: Buffer.from(referenceHash).toString("hex"),
	});
}

export function registerPayoutCommands(program: Command): void {
	withGlobals(program.command("payout:route").description("holder: receive payouts to the wallet or to a bank account (bank transfer SIMULATED)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--route <wallet|bank>", "where payouts go")
		.option("--bank-ref <text>", "bank details (only their sha256 goes on-chain)")
		.action(runRoute);
	withGlobals(program.command("payout:confirm-bank").description("paying agent: confirm a bank-routed payout with the transfer reference"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option("--index <n>", "action index (default: the open action)")
		.requiredOption("--owner <pubkey>", "the holder whose payout was transferred")
		.requiredOption("--reference <text>", "bank transfer reference (only its sha256 goes on-chain)")
		.action(runConfirm);
}
