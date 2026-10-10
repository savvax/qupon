/** `proof:verify <file>` — re-fetch every step of a proof manifest from devnet and check it (task 1526). */
import { readFileSync } from "node:fs";
import { signature } from "@solana/kit";
import type { Command } from "commander";
import { type ProofManifest, type ProofStep, verifyProofStep } from "../lib/proof.js";
import { initCtx, log, out, withGlobals } from "./common.js";

function loadManifest(file: string): ProofManifest {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(file, "utf8"));
	} catch (e) {
		throw new Error(`${file}: unreadable JSON (${(e as Error).message})`, { cause: e });
	}
	const m = parsed as Partial<ProofManifest>;
	if (m.version !== 1 || typeof m.programId !== "string" || !Array.isArray(m.steps)) {
		throw new Error(`${file}: not a proof manifest (expected version 1, programId, steps — see fixtures/proof.schema.json)`);
	}
	for (const s of m.steps as unknown[]) {
		const step = s as Partial<ProofStep>;
		if (typeof step.id !== "string" || typeof step.signature !== "string" || typeof step.instruction !== "string") {
			throw new Error(`${file}: step ${JSON.stringify(step.id)} is missing id/signature/instruction`);
		}
	}
	return m as ProofManifest;
}

/** Commander passes (argument, options, command) — only the command is needed here. */
async function runVerify(file: string, _opts: unknown, cmd: Command): Promise<void> {
	const { rpc } = await initCtx(cmd);
	const manifest = loadManifest(file);
	const failed: { id: string; signature: string; error: string }[] = [];
	for (const step of manifest.steps) {
		const res = await rpc
			.getTransaction(signature(step.signature), { encoding: "json", maxSupportedTransactionVersion: 0, commitment: "confirmed" })
			.send();
		const error = verifyProofStep(step, res, manifest.programId);
		log(`${error === undefined ? "✓" : "✗"} ${step.id} (${step.instruction})${error === undefined ? "" : ` — ${error}`}`);
		if (error !== undefined) failed.push({ id: step.id, signature: step.signature, error });
	}
	out({ ok: failed.length === 0, checked: manifest.steps.length, failed });
	if (failed.length > 0) process.exitCode = 1;
}

export function registerProofCommands(program: Command): void {
	withGlobals(program.command("proof:verify").description("verify every step of a devnet proof manifest against the chain"))
		.argument("<file>", "manifest JSON (reports/devnet-proof.json or a per-kind file)")
		.action(runVerify);
}
