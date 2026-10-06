/**
 * `asset:faucet` — mint devnet test cash (tKZT, KZTE-dev, dKZT…) to an owner's
 * ATA (task 603). Refuses mints that are not in config/devnet.json `testAssets`
 * — the faucet never mints arbitrary tokens. Creates the owner's ATA
 * idempotently and works for both classic SPL and Token-2022 mints.
 *
 * `asset:mint` / `asset:burn` — SIMULATED wrapped-CBDC custodian moves (task 606):
 * the custodian holds real digital tenge off-chain and wraps it 1:1 as dKZT.
 * Only `wrapped_cbdc` test assets; every move carries the CBDC deposit/withdrawal
 * reference in an on-chain memo.
 */
import { address, isAddress, type Address, type Instruction } from "@solana/kit";
import {
	TOKEN_2022_PROGRAM_ADDRESS,
	findAssociatedTokenPda,
	getBurnInstruction as getBurnInstructionT22,
	getCreateAssociatedTokenIdempotentInstruction,
	getMintToInstruction as getMintToInstructionT22,
} from "@solana-program/token-2022";
import { getBurnInstruction as getBurnInstructionSpl, getMintToInstruction as getMintToInstructionSpl } from "@solana-program/token";
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

/** The one wrapped_cbdc test asset (SIMULATED custodian, task 606) by symbol or mint; throws otherwise. */
export function resolveCustodianAsset(cfg: QuponConfig, mintOrSymbol: string): TestAsset {
	const list = cfg.testAssets ?? [];
	const hit = list.find(t => t.kind === "wrapped_cbdc" && (t.mint === mintOrSymbol || t.symbol === mintOrSymbol));
	if (hit === undefined) {
		throw new Error(
			`'${mintOrSymbol}' is not a wrapped_cbdc asset in config testAssets (custodian moves are dKZT-only; have: ${list.map(t => t.symbol).join(", ") || "none"})`,
		);
	}
	return hit;
}

/** Memo program v2 instruction carrying the CBDC deposit/withdrawal reference. */
function memoInstruction(text: string): Instruction {
	const bytes = new TextEncoder().encode(text);
	if (bytes.length > 100) throw new Error(`memo: ${bytes.length} bytes is over the 100-byte limit`);
	return {
		programAddress: address("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
		accounts: [],
		data: bytes,
	};
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

interface CustodianMintOpts extends GlobalOptions {
	mint: string;
	to: string;
	amount: string;
	memo?: string;
}

/** SIMULATED custodian deposit: wrap CBDC 1:1 by minting dKZT to a treasury ATA. */
async function runCustodianMint(opts: CustodianMintOpts, cmd: Command): Promise<void> {
	if (!isAddress(opts.to)) throw new Error(`--to '${opts.to}' is not an address`);
	const { rpc, cfg } = await initCtx(cmd);
	const asset = resolveCustodianAsset(cfg, opts.mint);
	const amount = parseBigInt(opts.amount, "amount");
	if (amount === 0n) throw new Error("amount: must be > 0 minor units");

	const registrar = await signer(cmd, "registrar"); // custodian mint authority (SIMULATED)
	const mint = address(asset.mint);
	const owner = address(opts.to);
	const tokenProgram = await tokenProgramOfMint(rpc, mint);
	const ata: Address = (await findAssociatedTokenPda({ mint, owner, tokenProgram }))[0];
	const instructions = [
		getCreateAssociatedTokenIdempotentInstruction({ payer: registrar, ata, owner, mint, tokenProgram }),
		...(opts.memo ? [memoInstruction(opts.memo)] : []),
		tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
			? getMintToInstructionT22({ mint, token: ata, mintAuthority: registrar, amount })
			: getMintToInstructionSpl({ mint, token: ata, mintAuthority: registrar, amount }),
	];
	const signature = await sendInstructions(rpc, registrar, instructions, `custodian mint ${asset.symbol}`);
	log(`SIMULATED custodian: wrapped ${amount} minor units of ${asset.symbol} to ${owner} (ref ${opts.memo ?? "-"}, ata ${ata})`);
	out({ ok: true, signature, ata, memo: opts.memo ?? "" });
}

interface CustodianBurnOpts extends GlobalOptions {
	mint: string;
	amount: string;
	memo?: string;
}

/** SIMULATED custodian withdrawal: burn dKZT from the issuer treasury (signer = treasury owner). */
async function runCustodianBurn(opts: CustodianBurnOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const asset = resolveCustodianAsset(cfg, opts.mint);
	const amount = parseBigInt(opts.amount, "amount");
	if (amount === 0n) throw new Error("amount: must be > 0 minor units");

	const issuer = await signer(cmd, "issuer"); // the custodial issuer treasury pays the wrapped tokens back
	const mint = address(asset.mint);
	const tokenProgram = await tokenProgramOfMint(rpc, mint);
	const ata: Address = (await findAssociatedTokenPda({ mint, owner: issuer.address, tokenProgram }))[0];
	const instructions = [
		...(opts.memo ? [memoInstruction(opts.memo)] : []),
		tokenProgram === TOKEN_2022_PROGRAM_ADDRESS
			? getBurnInstructionT22({ mint, account: ata, authority: issuer, amount })
			: getBurnInstructionSpl({ mint, account: ata, authority: issuer, amount }),
	];
	const signature = await sendInstructions(rpc, issuer, instructions, `custodian burn ${asset.symbol}`);
	log(`SIMULATED custodian: burned ${amount} minor units of ${asset.symbol} from ${issuer.address} (ref ${opts.memo ?? "-"})`);
	out({ ok: true, signature, ata, memo: opts.memo ?? "" });
}

export function registerAssetCommands(program: Command): void {
	withGlobals(program.command("asset:faucet").description("mint devnet test cash to an owner's ATA (testAssets only)"))
		.requiredOption("--mint <address>", "mint address (must be in config testAssets)")
		.requiredOption("--to <owner>", "owner address (receives the tokens)")
		.requiredOption("--amount <minor>", "amount in minor units")
		.action(runFaucet);
	withGlobals(program.command("asset:mint").description("SIMULATED custodian: wrap a CBDC deposit by minting wrapped_cbdc to a treasury"))
		.requiredOption("--mint <address|symbol>", "wrapped_cbdc asset (mint address or symbol, e.g. dKZT)")
		.requiredOption("--to <owner>", "treasury owner address (receives the tokens)")
		.requiredOption("--amount <minor>", "amount in minor units")
		.option("--memo <ref>", "CBDC deposit reference (stored in the tx memo and the audit ledger)")
		.action(runCustodianMint);
	withGlobals(program.command("asset:burn").description("SIMULATED custodian: burn wrapped_cbdc from the signer's treasury on withdrawal"))
		.requiredOption("--mint <address|symbol>", "wrapped_cbdc asset (mint address or symbol, e.g. dKZT)")
		.requiredOption("--amount <minor>", "amount in minor units")
		.option("--memo <ref>", "CBDC withdrawal reference (stored in the tx memo and the audit ledger)")
		.action(runCustodianBurn);
}
