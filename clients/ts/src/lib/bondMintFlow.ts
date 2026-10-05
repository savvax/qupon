/**
 * create-bond-mint core (docs/02-architecture.md "Creation sequence"), shared
 * by scripts/create-bond-mint.ts and the `series:create` CLI command:
 * MetadataPointer→mint, PermanentDelegate/Pausable/MintCloseAuthority =
 * series PDA, DefaultAccountState=Frozen, decimals 0, temporary registrar
 * mint authority handed to the series PDA, TokenMetadata with update
 * authority = registrar (the program requires that signer for metadata
 * CPIs). Idempotent per series: skips when the mint already exists.
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { address, createKeyPairFromBytes, createKeyPairFromPrivateKeyBytes, createSignerFromKeyPair, writeKeyPair, type Address, type KeyPairSigner } from "@solana/kit";
import { TOKEN_2022_PROGRAM_ADDRESS, fetchMaybeMint } from "@solana-program/token-2022";
import { loadConfig, updateConfig, type QuponConfig, type QuponSeriesConfig } from "./config.js";
import { loadKeypair } from "./keys.js";
import { seriesPda } from "./pda.js";
import {
	METADATA_RESERVE_BYTES,
	bondMetadataFields,
	bondMintSize,
	buildCreateBondMintInstructions,
	buildMetadataFieldInstructions,
} from "./bondMint.js";
import { sendInstructions, type QuponRpc } from "./tx.js";

function log(...args: unknown[]): void {
	console.error(...args);
}

function seriesConfig(cfg: QuponConfig, name: string): QuponSeriesConfig {
	const s = cfg.series[name];
	if (s === undefined) throw new Error(`series '${name}' not in config/devnet.json (have: ${Object.keys(cfg.series).join(", ")})`);
	return s;
}

async function mintExistsOnChain(rpc: QuponRpc, mint: string): Promise<boolean> {
	try {
		const account = await fetchMaybeMint(rpc, address(mint));
		return account.exists && account.programAddress === TOKEN_2022_PROGRAM_ADDRESS;
	} catch {
		return false;
	}
}

/** Reuse a stable mint keypair per series so re-running after a failed tx is safe. */
async function loadOrCreateMintKeypair(name: string): Promise<KeyPairSigner> {
	const path = `${homedir()}/.config/qupon/bond-mint-${name}.json`;
	if (existsSync(path)) {
		let bytes: number[];
		try {
			bytes = JSON.parse(readFileSync(path, "utf8")) as number[];
		} catch (e) {
			throw new Error(`cannot parse mint keypair '${path}': ${(e as Error).message}`, { cause: e });
		}
		log("reusing mint keypair", path);
		return createSignerFromKeyPair(await createKeyPairFromBytes(new Uint8Array(bytes)));
	}
	// generateKeyPair() makes non-extractable keys; build from random bytes so it can be persisted
	const keypair = await createKeyPairFromPrivateKeyBytes(crypto.getRandomValues(new Uint8Array(32)), true);
	await writeKeyPair(keypair, path);
	return createSignerFromKeyPair(keypair);
}

export interface BondMintResult {
	readonly mint: Address;
	readonly created: boolean;
	readonly signatures: string[];
}

/**
 * Create the Token-2022 bond mint for a series (idempotent): full create tx +
 * metadata fields when missing, metadata fields only on the resume path,
 * nothing when the config mint already exists on-chain.
 */
export async function ensureBondMint(opts: { rpc: QuponRpc; cfgPath: string; name: string }): Promise<BondMintResult> {
	const { rpc, cfgPath, name } = opts;
	const cfg = loadConfig(cfgPath);
	const sc = seriesConfig(cfg, name);
	const registrar = await loadKeypair("QUPON_REGISTRAR_KEYPAIR");

	if (sc.mint !== "" && (await mintExistsOnChain(rpc, sc.mint))) {
		log(`series.${name}.mint ${sc.mint} already exists — nothing to do.`);
		return { mint: address(sc.mint), created: false, signatures: [] };
	}

	const mintSigner = await loadOrCreateMintKeypair(name);
	const mint = mintSigner.address;
	const series = await seriesPda(mint);
	log(`series PDA for ${mint}: ${series}`);

	// resume path: mint keypair exists but create tx never landed — metadata fields only
	if (await mintExistsOnChain(rpc, mint)) {
		log(`mint ${mint} already on-chain — skipping create, writing metadata fields only`);
		const fields = bondMetadataFields(sc, Math.floor(Date.now() / 1000));
		const fieldsSig = await sendInstructions(rpc, registrar, buildMetadataFieldInstructions({ mint, registrar, fields }), `bond metadata ${name}`);
		return { mint, created: false, signatures: [fieldsSig] };
	}

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
	const seriesEntry = { ...sc, mint };
	updateConfig(cfgPath, { series: { ...cfg.series, [name]: seriesEntry } });
	log(`series.${name}.mint written to ${cfgPath}`);

	// tx 2 — additional metadata fields (registrar = update authority)
	const fields = bondMetadataFields(sc, Math.floor(Date.now() / 1000));
	const fieldsSig = await sendInstructions(
		rpc,
		registrar,
		buildMetadataFieldInstructions({ mint, registrar, fields }),
		`bond metadata ${name}`,
	);

	return { mint, created: true, signatures: [createSig, fieldsSig] };
}
