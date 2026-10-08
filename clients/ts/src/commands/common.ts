/**
 * Shared wiring for the command groups: context (rpc + config), role signers,
 * strict argument parsing, tx reporting and program-account listing.
 */
import {
	AccountRole,
	address,
	type Address,
	type Base64EncodedBytes,
	type Decoder,
	getAddressEncoder,
	getBase64Encoder,
	type Instruction,
	isAddress,
	type KeyPairSigner,
	getBase64Decoder,
	type ReadonlyUint8Array,
	type Signature,
	type TransactionSigner,
} from "@solana/kit";
import type { Command } from "commander";
import {
	ENTITLEMENT_DISCRIMINATOR,
	getEntitlementDecoder,
	getEntitlementSize,
	INVESTOR_DISCRIMINATOR,
	getInvestorDecoder,
	getInvestorSize,
	QUPON_BONDS_PROGRAM_ADDRESS,
	fetchSeries,
	type Series,
} from "../generated/index.js";
import { loadConfig, loadDemoConfig, tkztMintSet, type QuponConfig, type QuponSeriesConfig } from "../lib/config.js";
import { daysFromEpoch, fromUnixUtc, ymd, type Ymd } from "../lib/daycount.js";
import { loadKeypairFromPath } from "../lib/keys.js";
import { seriesPda } from "../lib/pda.js";
import { signatureStatus, createRpc, loadEnvFile, sendInstructions, type QuponRpc } from "../lib/tx.js";

/** The three global options, accepted before or after the command name. */
export interface GlobalOptions {
	rpc?: string;
	keypair?: string;
	json?: boolean;
}

/** Add the global options to a subcommand so `qupon <cmd> --rpc X` parses too. */
export function withGlobals(cmd: Command): Command {
	return cmd
		.option("--rpc <url>", "Solana RPC endpoint")
		.option("--keypair <path>", "signing keypair")
		.option("--json", "JSON output (always on)");
}

export type Role = "registrar" | "issuer" | "payingAgent" | "investor" | "kycProvider";

const ROLE_ENV: Record<Role, string> = {
	registrar: "QUPON_REGISTRAR_KEYPAIR",
	issuer: "QUPON_ISSUER_KEYPAIR",
	payingAgent: "QUPON_PAYING_AGENT_KEYPAIR",
	investor: "QUPON_INVESTOR_KEYPAIR",
	kycProvider: "QUPON_KYC_PROVIDER_KEYPAIR",
};

export interface Ctx {
	readonly rpc: QuponRpc;
	readonly cfg: QuponConfig;
}

/** Per-command context: loads .env, config and the RPC endpoint (option > env > public devnet). */
export async function initCtx(cmd: Command): Promise<Ctx> {
	loadEnvFile();
	const o = cmd.optsWithGlobals() as GlobalOptions;
	return { rpc: createRpc(o.rpc), cfg: loadConfig() };
}

/** Signing keypair: --keypair > QUPON_KEYPAIR > role-specific env var. */
export async function signer(cmd: Command, role: Role): Promise<KeyPairSigner> {
	const o = cmd.optsWithGlobals() as GlobalOptions;
	const path = o.keypair ?? process.env.QUPON_KEYPAIR ?? process.env[ROLE_ENV[role]];
	if (path === undefined || path === "") {
		throw new Error(`no ${role} keypair: pass --keypair <path> or set QUPON_KEYPAIR / ${ROLE_ENV[role]}`);
	}
	return loadKeypairFromPath(path);
}

/** Logs go to stderr only (stdout carries JSON). */
export function log(...args: unknown[]): void {
	console.error(...args);
}

/** JSON value tree: bigints as strings, bytes as utf-8 (text fields) or hex. */
export type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

const TEXT_FIELDS = /isin|ticker|corp|official/i;

function toHex(bytes: Uint8Array): string {
	return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}

/** Convert decoded account data (bigints, byte fields) into plain JSON values. */
export function toJsonValue(v: unknown, key = ""): Json {
	if (typeof v === "bigint") return v.toString();
	if (typeof v === "string" || typeof v === "number" || typeof v === "boolean" || v === null) return v;
	if (v instanceof Uint8Array) {
		return TEXT_FIELDS.test(key) ? new TextDecoder().decode(v).replace(/\0+$/, "") : toHex(v);
	}
	if (Array.isArray(v)) return v.map(x => toJsonValue(x, key));
	if (typeof v === "object" && v !== undefined) {
		return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, toJsonValue(x, k)]));
	}
	return null; // undefined / functions do not serialize
}

/** Print one JSON object on stdout. */
export function out(obj: unknown): void {
	console.log(JSON.stringify(toJsonValue(obj)));
}

/** Strict "YYYY-MM-DD" → Ymd. */
export function parseYmd(s: string, label = "date"): Ymd {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
	if (m === null) throw new Error(`${label}: expected YYYY-MM-DD, got '${s}'`);
	return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** Asia/Almaty is UTC+5 (no DST); midnight ts of a civil date. */
export function almatyMidnight(d: Ymd): bigint {
	return BigInt(daysFromEpoch(d)) * 86_400n - 5n * 3_600n;
}

/** "+90" (seconds from now) or an absolute unix timestamp. */
export function parseAt(s: string, label: string): bigint {
	if (s.startsWith("+")) return BigInt(Math.floor(Date.now() / 1000)) + BigInt(s.slice(1));
	const n = BigInt(s);
	if (n < 0n) throw new Error(`${label}: negative timestamp '${s}'`);
	return n;
}

/** Non-negative bigint (amounts, units). */
export function parseBigInt(s: string, label: string): bigint {
	const n = BigInt(s);
	if (n < 0n) throw new Error(`${label}: negative value '${s}'`);
	return n;
}

/** Non-negative integer (bps, enum-ish numbers). */
export function parseIntArg(s: string, label: string): number {
	const n = Number(s);
	if (!Number.isInteger(n) || n < 0) throw new Error(`${label}: expected a non-negative integer, got '${s}'`);
	return n;
}

/** ASCII bytes zero-padded to the fixed on-chain field size. */
/**
 * Default CORP id `<series>-<KIND>-####`, at most 16 bytes (the on-chain field): long series names are shortened to
 * their first alphanumerics so the suffix always fits — `QPNb1-INTR-0001` stays as is, `QPNb1-tmg46q` → `QPNb1t-INTR-0001`.
 */
export function defaultCorpId(series: string, kind: string, n: number): string {
	const suffix = `-${kind}-${String(n).padStart(4, "0")}`;
	const room = 16 - suffix.length;
	return (series.length <= room ? series : series.replace(/[^A-Za-z0-9]/g, "").slice(0, room)) + suffix;
}

export function padAscii(s: string, n: number): Uint8Array {
	const b = new TextEncoder().encode(s);
	if (b.length > n) throw new Error(`'${s}' is longer than ${n} bytes`);
	const field = new Uint8Array(n);
	field.set(b);
	return field;
}

const DAY_COUNT_CODES: Record<string, number> = { THIRTY_360: 0, ACT_ACT: 1, ACT_365: 2 };

/** Day-count name from config → on-chain code. */
export function dayCountCode(name: string): number {
	const code = DAY_COUNT_CODES[name];
	if (code === undefined) throw new Error(`dayCount: unknown '${name}' (THIRTY_360 | ACT_365)`);
	return code;
}

/** "tKZT"/"USDC" alias from config, or a raw mint address. */
export function resolveCashMint(cfg: QuponConfig, alias: string): Address {
	if (alias === "tKZT") {
		if (!tkztMintSet(cfg)) throw new Error("tkztMint is not created yet (run scripts/create-tkzt.ts)");
		return address(cfg.tkztMint);
	}
	if (alias === "USDC") return address(cfg.usdcMint);
	if (!isAddress(alias)) throw new Error(`cashMint '${alias}' is neither tKZT/USDC nor an address`);
	return address(alias);
}

/** Owning token program of a mint (SPL Token vs Token-2022). */
export async function tokenProgramOfMint(rpc: QuponRpc, mint: Address): Promise<Address> {
	const { value } = await rpc.getAccountInfo(mint, { commitment: "confirmed", encoding: "base64" }).send(); // base58 is refused for > 128 bytes (Token-2022 mints)
	if (value === null) throw new Error(`cash mint ${mint} not found on chain`);
	return value.owner;
}

export interface SeriesInfo {
	readonly name: string;
	readonly sc: QuponSeriesConfig;
	readonly mint: Address;
	readonly pda: Address;
	readonly account: Series;
}

export function seriesConfig(cfg: QuponConfig, name: string): QuponSeriesConfig {
	const sc = cfg.series[name];
	if (sc === undefined) {
		throw new Error(`series '${name}' not in config/devnet.json (have: ${Object.keys(cfg.series).join(", ")})`);
	}
	return sc;
}

/** Series config entry + on-chain Series account (the series must already be initialized). */
export async function loadSeries(rpc: QuponRpc, cfg: QuponConfig, name: string): Promise<SeriesInfo> {
	const sc = seriesConfig(cfg, name);
	if (!isAddress(sc.mint) || sc.mint === "") {
		throw new Error(`series.${name}.mint is not set — run scripts/create-bond-mint.ts --series ${name} first`);
	}
	const mint = address(sc.mint);
	const pda = await seriesPda(mint);
	let account: Series;
	try {
		account = (await fetchSeries(rpc, pda)).data;
	} catch (e) {
		throw new Error(`Series ${pda} not found for '${name}' — run series:init first (${(e as Error).message})`, {
			cause: e,
		});
	}
	return { name, sc, mint, pda, account };
}

/** issue/maturity dates for a series name from config/demo.json, when present. */
export function demoDates(name: string): { issueDate?: string; maturityDate?: string } {
	try {
		const demo = loadDemoConfig().series[name as keyof ReturnType<typeof loadDemoConfig>["series"]];
		return demo === undefined ? {} : { issueDate: demo.issueDate, maturityDate: demo.maturityDate };
	} catch {
		return {};
	}
}

export interface TxReport {
	readonly signature: Signature;
	readonly slot: bigint;
}

/** Send with blockhash retry + confirmed commitment; returns the tx report without printing. */
export async function sendQuiet(
	rpc: QuponRpc,
	payer: TransactionSigner,
	instructions: Instruction[],
	label: string,
): Promise<TxReport> {
	const signature = await sendInstructions(rpc, payer, instructions, label);
	return { signature, slot: (await signatureStatus(rpc, signature))?.slot ?? 0n };
}

/** Send, then print `{ok:true, signature, slot, …extra}` on stdout. */
export async function sendAndReport(
	rpc: QuponRpc,
	payer: TransactionSigner,
	instructions: Instruction[],
	label: string,
	extra: Record<string, unknown> = {},
): Promise<TxReport> {
	const report = await sendQuiet(rpc, payer, instructions, label);
	out({ ok: true, signature: report.signature, slot: report.slot, ...extra });
	return report;
}

/** Read-only / writable remaining-account metas for batch instructions. */
export function ro(a: Address): { address: Address; role: AccountRole.READONLY } {
	return { address: a, role: AccountRole.READONLY };
}

export function wr(a: Address): { address: Address; role: AccountRole.WRITABLE } {
	return { address: a, role: AccountRole.WRITABLE };
}

export interface ListedInvestor {
	readonly address: Address;
	readonly owner: Address;
	readonly bondAta: Address;
	readonly cashAta: Address;
	readonly investorType: number;
	readonly residency: number;
	readonly taxRateBps: number;
	readonly status: number;
	readonly registeredAt: bigint;
}

export interface ListedEntitlement {
	readonly address: Address;
	readonly owner: Address;
	readonly units: bigint;
	readonly gross: bigint;
	readonly tax: bigint;
	readonly net: bigint;
	readonly principal: bigint;
	readonly status: number;
	readonly paidAt: bigint;
}

/**
 * All program accounts of one discriminator whose second PDA field (byte 9, after
 * discriminator+bump) equals `key` — i.e. Investor(series) / Entitlement(action) / TradeAdmission(series).
 */
export async function listByKey<T>(
	rpc: QuponRpc,
	discriminator: ReadonlyUint8Array,
	dataSize: number,
	key: Address,
	decoder: Decoder<T>,
): Promise<{ address: Address; data: T }[]> {
	const b64 = getBase64Decoder();
	// memcmp wants base64 text; getAddressEncoder gives the 32 raw key bytes.
	const memcmp = (bytes: ReadonlyUint8Array | Uint8Array, offset: bigint) => ({
		memcmp: { bytes: b64.decode(bytes) as Base64EncodedBytes, encoding: "base64" as const, offset },
	});
	const res = await rpc
		.getProgramAccounts(QUPON_BONDS_PROGRAM_ADDRESS, {
			commitment: "confirmed",
			encoding: "base64",
			filters: [
				memcmp(new Uint8Array(discriminator), 0n),
				memcmp(getAddressEncoder().encode(key), 9n),
				{ dataSize: BigInt(dataSize) },
			],
		})
		.send();
	// getBase64Encoder().encode(s) parses base64 text back into raw bytes.
	const b64ToBytes = getBase64Encoder();
	return res.map(item => {
		const [encoded] = item.account.data;
		if (encoded === undefined) throw new Error(`empty account data for ${item.pubkey}`);
		return { address: item.pubkey, data: decoder.decode(b64ToBytes.encode(encoded)) };
	});
}

const investorDecoder = getInvestorDecoder();
const entitlementDecoder = getEntitlementDecoder();

/** All Investor PDAs of a series (unsorted — callers sort by owner ascending). */
export async function listInvestors(rpc: QuponRpc, series: Address): Promise<ListedInvestor[]> {
	const rows = await listByKey(rpc, INVESTOR_DISCRIMINATOR, getInvestorSize(), series, investorDecoder);
	return rows.map(({ address: a, data }) => ({
		address: a,
		owner: data.owner,
		bondAta: data.bondAta,
		cashAta: data.cashAta,
		investorType: data.investorType,
		residency: data.residency,
		taxRateBps: data.taxRateBps,
		status: data.status,
		registeredAt: data.registeredAt,
	}));
}

/** All Entitlement PDAs of a corporate action (unsorted). */
export async function listEntitlements(rpc: QuponRpc, action: Address): Promise<ListedEntitlement[]> {
	const rows = await listByKey(rpc, ENTITLEMENT_DISCRIMINATOR, getEntitlementSize(), action, entitlementDecoder);
	return rows.map(({ address: a, data }) => ({
		address: a,
		owner: data.owner,
		units: data.units,
		gross: data.gross,
		tax: data.tax,
		net: data.net,
		principal: data.principal,
		status: data.status,
		paidAt: data.paidAt,
	}));
}

/** Almaty civil date of an on-chain timestamp (used for coupon period args). */
export function almatyDate(ts: bigint | number): Ymd {
	return fromUnixUtc(Number(ts) + 5 * 3_600);
}
