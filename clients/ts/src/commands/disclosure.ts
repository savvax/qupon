/**
 * `disclosure:attach` (plan 15 D9): the registrar anchors the sha256 of the action's official notification
 * (the seev.031 XML file) once; anyone can re-hash the served file and compare it with the chain.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { Command } from "commander";
import { getAttachDisclosureInstruction } from "../generated/index.js";
import { loadAction } from "./action.js";
import { initCtx, loadSeries, sendAndReport, signer, withGlobals, type GlobalOptions } from "./common.js";

interface AttachOpts extends GlobalOptions {
	series: string;
	index?: string;
	file: string;
}

/** sha256 of the notification file's bytes — the only thing that ever goes on-chain (plan 15 D9). Pure — unit-tested. */
export async function disclosureHash(file: string): Promise<Uint8Array> {
	return new Uint8Array(createHash("sha256").update(await readFile(file)).digest());
}
async function runAttach(opts: AttachOpts, cmd: Command): Promise<void> {
	const { rpc, cfg } = await initCtx(cmd);
	const info = await loadSeries(rpc, cfg, opts.series);
	const registrar = await signer(cmd, "registrar");
	const { action } = await loadAction(rpc, info, opts.index);
	const hash = await disclosureHash(opts.file);
	const instruction = getAttachDisclosureInstruction({ registrar, series: info.pda, action, hash });
	await sendAndReport(rpc, registrar, [instruction], "disclosure:attach", {
		action,
		file: opts.file,
		sha256: Buffer.from(hash).toString("hex"),
	});
}

export function registerDisclosureCommands(program: Command): void {
	withGlobals(program.command("disclosure:attach").description("registrar: anchor the sha256 of an action's official notification (once)"))
		.requiredOption("--series <name>", "series name in config/devnet.json")
		.option("--index <n>", "action index (default: the open action)")
		.requiredOption("--file <path>", "the notification file (seev.031 XML)")
		.action(runAttach);
}
