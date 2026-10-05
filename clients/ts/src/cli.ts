#!/usr/bin/env node
/**
 * `qupon` CLI (docs/02-architecture.md §TypeScript client and CLI).
 * This file only wires the commander program; command groups live in ./commands/
 * and are registered through ./commands/index.ts.
 * JSON goes to stdout, logs to stderr, non-zero exit on failure.
 */
import { Command } from "commander";
import { registerCommands } from "./commands/index.js";

const program = new Command()
	.name("qupon")
	.description("Qupon corporate-actions engine CLI (Solana devnet)")
	.version("0.1.0")
	.option("--rpc <url>", "Solana RPC endpoint (default: RPC_URL env or public devnet)")
	.option("--keypair <path>", "signing keypair (default: QUPON_KEYPAIR or role-specific env)")
	.option("--json", "JSON on stdout and logs on stderr (always on; accepted for scripts)");

registerCommands(program);

program.parseAsync(process.argv).catch((e: unknown) => {
	console.error(`qupon: ${(e as Error).message}`);
	process.exitCode = 1;
});
