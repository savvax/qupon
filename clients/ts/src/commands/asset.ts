/**
 * `asset:faucet` — mint devnet test cash (tKZT, KZTE-dev, dKZT…) to an owner's
 * ATA (task 603). Refuses mints that are not in config/devnet.json `testAssets`
 * — the faucet never mints arbitrary tokens. Creates the owner's ATA
 * idempotently and works for both classic SPL and Token-2022 mints.
 */
import { address, isAddress, type Address } from "@solana/kit";
import {
	TOKEN_2022_PROGRAM_ADDRESS,
	findAssociatedTokenPda,
	getCreateAssociatedTokenIdempotentInstruction,
	getMintToInstruction as getMintToInstructionT22,
} from "@solana-program/token-2022";
import { getMintToInstruction as getMintToInstructionSpl } from "@solana-program/token";
import type { Command } from "commander";
import type { QuponConfig, TestAsset } from "../lib/config.js";
import { sendInstructions } from "../lib/tx.js";
import {
	initCtx,
	log,
	out,
	parseBigInt,
	signer,
	tokenProgramOfMint,
	withGlobals,
	type GlobalOptions,
} from "./common.js";

/** The one testAssets entry whose mint address matches; throws for anything else. */
export function resolveTestAsset(cfg: QuponConfig, mint: string): TestAsset {
	const list = cfg.testAssets ?? [];
	const hit = list.find(t => t.mint === mint);
	if (hit === undefined) {
		throw new Error(
			`mint '${mint}' is not in config testAssets (have: ${list.map(t => t.symbol).join(", ") || "none"} — scripts/create-test-asset.ts adds entries)`,
		);
	}
	return hit;
}

interface FaucetOpts extends GlobalOptions {
	mint: string;
	to: string;
	amount: string;
}

async function runFaucet(opts: FaucetOpts, cmd: Command): Promise<void> {
	if (!isAddress(opts.mint)) throw new Error(`--mint '${opts.mint}' is not an address`);
	if (!isAddress(opts.to)) throw new Error(`--to '${opts.to}' is not an address`);
	const { rpc, cfg } = await initCtx(cmd);
	const asset = resolveTestAsset(cfg, opts.mint);
	const amount = parseBigInt(opts.amount, "amount");
	if (amount === 0n) throw new Error("amount: must be > 0 minor units");

	const registrar = await signer(cmd, "registrar"); // mint authority of every test asset
	const mint = address(opts.mint);
	const owner = address(opts.to);
	const tokenProgram = await tokenProgramOfMint(rpc, mint);
	const ata: Address = (await findAssociatedTokenPda({ mint, owner, tokenProgram }))[0];
	const instructions = [
		getCreateAssociatedTokenIdempotentInstruction({ payer: registrar, ata, owner, mint, tokenProgram }),
		tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
			? getMintToInstructionT22({ mint, token: ata, mintAuthority: registrar, amount })
			: getMintToInstructionSpl({ mint, token: ata, mintAuthority: registrar, amount }),
	];
	const signature = await sendInstructions(rpc, registrar, instructions, `faucet ${asset.symbol}`);
	log(`${asset.symbol}: minted ${amount} minor units to ${owner} (ata ${ata})`);
	out({ ok: true, signature, ata });
}

export function registerAssetCommands(program: Command): void {
	withGlobals(program.command("asset:faucet").description("mint devnet test cash to an owner's ATA (testAssets only)"))
		.requiredOption("--mint <address>", "mint address (must be in config testAssets)")
		.requiredOption("--to <owner>", "owner address (receives the tokens)")
		.requiredOption("--amount <minor>", "amount in minor units")
		.action(runFaucet);
}
