/** `state:dump` — all PDAs of a series as JSON · `explorer` — devnet explorer links. */
import { fetchEncodedAccounts, type Address } from "@solana/kit";
import type { Command } from "commander";
import { fetchCorporateAction } from "../generated/index.js";
import { addressLink, txLink } from "../lib/explorer.js";
import { actionPda } from "../lib/pda.js";
import {
	initCtx,
	listEntitlements,
	listInvestors,
	loadSeries,
	log,
	out,
	withGlobals,
	type GlobalOptions,
} from "./common.js";

interface DumpOpts extends GlobalOptions {
	series: string;
	entitlements: boolean;
	raw: boolean;
}

/** Base64 account data per PDA (`--raw`), fetched in one getMultipleAccounts call. */
async function rawBytes(rpc: Parameters<typeof fetchEncodedAccounts>[0], addresses: Address[]): Promise<Map<Address, string>> {
	const encoded = await fetchEncodedAccounts(rpc, addresses);
	// Missing accounts are logged by the fetches above; only map the ones that exist.
	return new Map(encoded.flatMap(a => (("data" in a) ? [[a.address as Address, String(a.data)] as const] : [])));
}

async function runStateDump(opts: DumpOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	// Sorted by owner ascending — the same deterministic order pay/snapshot batches use.
	const investors = (await listInvestors(rpc, info.pda)).sort((a, b) => a.owner.localeCompare(b.owner));
	const actions = [];
	for (let i = 0; i < info.account.actionCount; i++) {
		const pda = await actionPda(info.pda, i);
		try {
			actions.push({ address: pda, data: (await fetchCorporateAction(rpc, pda)).data });
		} catch {
			log(`action ${i} (${pda}) missing — skipped`);
		}
	}
	const entitlements = opts.entitlements
		? (await Promise.all(actions.map(a => listEntitlements(rpc, a.address))))
			.flat()
			.sort((a, b) => a.owner.localeCompare(b.owner))
		: [];
	const raw = opts.raw
		? await rawBytes(rpc, [
				info.pda,
				...investors.map(i => i.address),
				...actions.map(a => a.address),
				...entitlements.map(e => e.address),
			])
		: undefined;
	const b64 = (a: Address): Record<string, string> => (raw === undefined ? {} : { dataB64: raw.get(a) ?? "" });
	out({
		series: { address: info.pda, data: info.account, ...b64(info.pda) },
		investors: investors.map(i => ({ address: i.address, data: i, ...b64(i.address) })),
		actions: actions.map(a => ({ address: a.address, data: a.data, ...b64(a.address) })),
		entitlements: entitlements.map(e => ({ address: e.address, data: e, ...b64(e.address) })),
	});
}

interface ExplorerOpts extends GlobalOptions {
	address?: string;
	tx?: string;
}

async function runExplorer(opts: ExplorerOpts): Promise<void> {
	if (opts.address !== undefined) {
		out({ address: opts.address, link: addressLink(opts.address) });
		return;
	}
	if (opts.tx !== undefined) {
		out({ signature: opts.tx, link: txLink(opts.tx) });
		return;
	}
	throw new Error("pass --address <pubkey> or --tx <signature>");
}

export function registerStateCommands(program: Command): void {
	withGlobals(program.command("state:dump").description("dump every PDA of a series as JSON"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option("--no-entitlements", "skip per-action entitlement accounts")
		.option("--raw", "include base64 account data per PDA (fixtures/accounts export)")
		.action(runStateDump);

	withGlobals(program.command("explorer").description("print devnet explorer links"))
		.option("--address <pubkey>", "account address")
		.option("--tx <signature>", "transaction signature")
		.action(runExplorer);
}
