/**
 * Create the Token-2022 bond mint for a series (docs/02-architecture.md
 * "Creation sequence"): MetadataPointer→mint, PermanentDelegate/Pausable/
 * MintCloseAuthority = series PDA, DefaultAccountState=Frozen, decimals 0,
 * temporary registrar mint authority handed to the series PDA, TokenMetadata
 * with update authority = registrar (the program requires that signer for
 * metadata CPIs). Idempotent per series: skips when the mint already exists.
 *
 * Usage: pnpm tsx scripts/create-bond-mint.ts --series QPNb1
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { address, createKeyPairFromBytes, createKeyPairFromPrivateKeyBytes, createSignerFromKeyPair, writeKeyPair, type KeyPairSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, fetchMint } from "@solana-program/token-2022";
import { configPath, loadConfig, updateConfig, type QuponConfig } from "../src/lib/config.js";
import { loadKeypair } from "../src/lib/keys.js";
import { seriesPda } from "../src/lib/pda.js";
import {
	METADATA_RESERVE_BYTES,
	bondMetadataFields,
	bondMintSize,
	buildCreateBondMintInstructions,
	buildMetadataFieldInstructions,
} from "../src/lib/bondMint.js";
import { addressLink } from "../src/lib/explorer.js";
import { createRpc, loadEnvFile, sendInstructions, type QuponRpc } from "../src/lib/tx.js";

function log(...args: unknown[]): void {
	console.error(...args);
}

function parseArgs(argv: string[]): string {
	const i = argv.indexOf("--series");
	const name = i >= 0 ? argv[i + 1] : undefined;
	if (!name) throw new Error("usage: create-bond-mint.ts --series <name from config/devnet.json>");
	return name;
}

function seriesConfig(cfg: QuponConfig, name: string) {
	const s = cfg.series[name];
	if (s === undefined) throw new Error(`series '${name}' not in config/devnet.json (have: ${Object.keys(cfg.series).join(", ")})`);
	return s;
}

async function mintExistsOnChain(rpc: QuponRpc, mint: string): Promise<boolean> {
	try {
		const account = await fetchMint(rpc, address(mint));
		return account.exists && account.programAddress === TOKEN_2022_PROGRAM_ADDRESS;
	} catch {
		return false;
	}
}

/** Reuse a stable mint keypair per series so re-running after a failed tx is safe. */
async function loadOrCreateMintKeypair(name: string): Promise<KeyPairSigner> {
	const path = `${homedir()}/.config/qupon/bond-mint-${name}.json`;
	if (existsSync(path)) {
		const bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
		log("reusing mint keypair", path);
		return createSignerFromKeyPair(await createKeyPairFromBytes(new Uint8Array(bytes)));
	}
	// generateKeyPair() makes non-extractable keys; build from random bytes so it can be persisted
	const keypair = await createKeyPairFromPrivateKeyBytes(crypto.getRandomValues(new Uint8Array(32)), true);
	await writeKeyPair(keypair, path);
	return createSignerFromKeyPair(keypair);
}

async function main(): Promise<void> {
	loadEnvFile();
	const name = parseArgs(process.argv.slice(2));
	const cfgPath = configPath();
	const cfg = loadConfig(cfgPath);
	const sc = seriesConfig(cfg, name);
	const rpc = createRpc();
	const registrar = await loadKeypair("QUPON_REGISTRAR_KEYPAIR");

	if (sc.mint !== "" && (await mintExistsOnChain(rpc, sc.mint))) {
		log(`series.${name}.mint ${sc.mint} already exists — nothing to do.`);
		console.log(JSON.stringify({ series: name, mint: sc.mint, created: false }));
		return;
	}

	const mintSigner = await loadOrCreateMintKeypair(name);
	const mint = mintSigner.address;
	const series = await seriesPda(mint);
	log(`series PDA for ${mint}: ${series}`);

	const space = bondMintSize(series, registrar.address);
	const lamports = BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(space + METADATA_RESERVE_BYTES)).send());
	log(`mint space ${space} + ${METADATA_RESERVE_BYTES} B metadata reserve, rent ${lamports} lamports`);

	// tx 1 — account + extensions + mint + TokenMetadata + authority handoff
	const createSig = await sendInstructions(
		rpc,
		registrar,
		buildCreateBondMintInstructions({
			mint: mintSigner,
			series,
			registrar,
			lamports,
			name: `Qupon Bond ${name}`,
			symbol: name,
			uri: `https://qupon.example/${name}.json`,
		}),
		`create bond mint ${name}`,
	);
	log(`mint created (tx ${createSig})`);

	// tx 2 — additional metadata fields (registrar = update authority)
	const fields = bondMetadataFields(sc, Math.floor(Date.now() / 1000));
	const fieldsSig = await sendInstructions(
		rpc,
		registrar,
		buildMetadataFieldInstructions({ mint, registrar, fields }),
		`bond metadata ${name}`,
	);

	const seriesEntry = { ...sc, mint };
	const updated = { ...cfg.series, [name]: seriesEntry };
	updateConfig(cfgPath, { series: updated });
	log(`series.${name}.mint written to ${cfgPath}`);

	console.log(
		JSON.stringify({
			series: name,
			mint,
			seriesPda: series,
			created: true,
			createTx: createSig,
			metadataTx: fieldsSig,
			explorer: addressLink(mint),
			extensions: ["MetadataPointer", "TokenMetadata", "PermanentDelegate", "PausableConfig", "MintCloseAuthority", "DefaultAccountState(Frozen)"],
			space,
			lamports: lamports.toString(),
			metadataFields: Object.fromEntries(fields.map(f => [f.field, f.value])),
		}),
	);
}

main().catch(e => {
	log(`create-bond-mint failed: ${(e as Error).message}`);
	process.exit(1);
});
