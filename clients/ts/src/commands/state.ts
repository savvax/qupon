/** `state:dump` — all PDAs of a series as JSON · `explorer` — devnet explorer links. */
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
}

async function runStateDump(opts: DumpOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const investors = await listInvestors(rpc, info.pda);
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
		? await Promise.all(actions.map(a => listEntitlements(rpc, a.address)))
		: [];
	out({
		series: { address: info.pda, data: info.account },
		investors: investors.map(i => ({ address: i.address, data: i })),
		actions: actions.map(a => ({ address: a.address, data: a.data })),
		entitlements: entitlements.flat().map(e => ({ address: e.address, data: e })),
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
		.action(runStateDump);

	withGlobals(program.command("explorer").description("print devnet explorer links"))
		.option("--address <pubkey>", "account address")
		.option("--tx <signature>", "transaction signature")
		.action(runExplorer);
}
