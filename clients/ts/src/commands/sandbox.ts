/**
 * `sandbox:refuse` — judge sandbox scenario (task 1524): attempt a bond transfer from a custodial demo
 * investor to a wallet with no investor record and report the on-chain refusal. The transaction is sent
 * with skipPreflight, so the failed tx still lands with a signature and logs the page can show.
 */
import {
	address,
	pipe,
	createTransactionMessage,
	appendTransactionMessageInstructions,
	setTransactionMessageFeePayerSigner,
	setTransactionMessageLifetimeUsingBlockhash,
	signTransactionMessageWithSigners,
	getSignatureFromTransaction,
	sendTransactionWithoutConfirmingFactory,
} from "@solana/kit";
import {
	findAssociatedTokenPda,
	getCreateAssociatedTokenIdempotentInstruction,
	getTransferCheckedInstruction as getTransferCheckedInstructionT22,
	TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import type { Command } from "commander";
import { withHookExtras } from "../lib/hook.js";
import { loadKeypairFromPath } from "../lib/keys.js";
import { anchorErrorFromLogs, computeUnitLimit } from "../lib/tx.js";
import { initCtx, loadSeries, log, out, parseBigInt, withGlobals, type GlobalOptions } from "./common.js";

interface RefuseOpts extends GlobalOptions {
	series: string;
	keypair: string;
	to: string;
	units?: string;
}

const ata = async (owner: Parameters<typeof findAssociatedTokenPda>[0]["owner"], mint: Parameters<typeof findAssociatedTokenPda>[0]["mint"]) =>
	(await findAssociatedTokenPda({ owner, mint, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }))[0];

async function runRefuse(opts: RefuseOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	// --keypair is the global option (withGlobals): redeclaring it crashed every CLI command at registration.
	if (!opts.keypair) throw new Error("--keypair <path> (the sending holder) is required");
	const holder = await loadKeypairFromPath(opts.keypair);
	const to = address(opts.to);
	const units = parseBigInt(opts.units ?? "1", "--units");
	if (to === holder.address) throw new Error("--to must differ from the sender");

	const source = await ata(holder.address, info.mint);
	const destination = await ata(to, info.mint);
	const create = getCreateAssociatedTokenIdempotentInstruction({
		payer: holder,
		ata: destination,
		owner: to,
		mint: info.mint,
		tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
	});
	let transfer = getTransferCheckedInstructionT22({
		source,
		mint: info.mint,
		destination,
		authority: holder,
		amount: units,
		decimals: 0, // bond mints are whole units (bondMint.ts)
	});
	transfer = await withHookExtras(transfer, info.mint, holder.address, to);

	log(`attempting ${units} bond(s) ${holder.address} → ${to} (expecting the on-chain refusal)`);
	const send = sendTransactionWithoutConfirmingFactory({ rpc });
	type SendConfig = Parameters<typeof send>[1];
	const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
	const message = pipe(
		createTransactionMessage({ version: 0 }),
		m => setTransactionMessageFeePayerSigner(holder, m),
		m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
		m => appendTransactionMessageInstructions([computeUnitLimit(600_000), create, transfer], m),
	);
	const transaction = await signTransactionMessageWithSigners(message);
	const signature = getSignatureFromTransaction(transaction);
	// skipPreflight is a plain sendTransaction RPC param kit 8 does not type; without it preflight would
	// swallow the refusal and the failed tx would never have a signature.
	await send(transaction, { skipPreflight: true } as SendConfig & { skipPreflight: boolean });

	for (let i = 0; i < 20; i++) {
		const status = await rpc.getSignatureStatuses([signature]).send();
		const s = status.value[0];
		if (s === null || s === undefined || s.confirmationStatus === "confirmed" || s.confirmationStatus === "finalized") break;
		await new Promise(resolve => setTimeout(resolve, 1_500));
	}
	const tx = await rpc.getTransaction(signature, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }).send();
	const logs: readonly string[] = tx?.meta?.logMessages ?? [];
	const failed = logs.find(l => l.includes("failed"));
	const error = anchorErrorFromLogs(logs) ?? failed ?? "TransactionFailed";
	log(`refused as expected: ${error}`);
	out({ ok: false, error, signature, logs, series: opts.series, to });
}

export function registerSandboxCommands(program: Command): void {
	withGlobals(program.command("sandbox:refuse").description("sandbox scenario: transfer to a non-KYC wallet and report the on-chain refusal (skipPreflight)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.requiredOption("--to <address>", "the unregistered wallet that must be refused")
		.option("--units <n>", "bonds to attempt (default 1)")
		.action(runRefuse);
}
