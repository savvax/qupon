/**
 * Thin wrapper over src/lib/bondMintFlow.ts (the series:create CLI command
 * and this script share it). Idempotent per series.
 *
 * Usage: pnpm tsx scripts/create-bond-mint.ts --series QPNb1
 */
import { configPath } from "../src/lib/config.js";
import { addressLink } from "../src/lib/explorer.js";
import { ensureBondMint } from "../src/lib/bondMintFlow.js";
import { createRpc, loadEnvFile } from "../src/lib/tx.js";

function log(...args: unknown[]): void {
	console.error(...args);
}

function parseArgs(argv: string[]): string {
	const i = argv.indexOf("--series");
	const name = i >= 0 ? argv[i + 1] : undefined;
	if (!name) throw new Error("usage: create-bond-mint.ts --series <name from config/devnet.json>");
	return name;
}

async function main(): Promise<void> {
	loadEnvFile();
	const name = parseArgs(process.argv.slice(2));
	const res = await ensureBondMint({ rpc: createRpc(), cfgPath: configPath(), name });
	log(`bond mint ${res.mint} (${addressLink(res.mint)})`);
	console.log(JSON.stringify({ series: name, mint: res.mint, created: res.created, signatures: res.signatures }));
}

main().catch(e => {
	log(`create-bond-mint failed: ${(e as Error).message}`);
	process.exit(1);
});
