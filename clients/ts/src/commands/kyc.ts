/** `kyc:setup`, `kyc:attest` — the (SIMULATED) KYC provider issues Solana Attestation Service attestations. */
import { type Address, type Instruction, address, fetchEncodedAccount } from "@solana/kit";
import type { Command } from "commander";
import { getCreateAttestationInstruction, getCreateCredentialInstruction, getCreateSchemaInstruction } from "sas-lib";
import {
	KYC_CREDENTIAL,
	KYC_CREDENTIAL_NAME,
	KYC_PROVIDER,
	KYC_SCHEMA,
	KYC_SCHEMA_FIELDS,
	KYC_SCHEMA_LAYOUT,
	KYC_SCHEMA_NAME,
	encodeKycData,
	kycAttestationPda,
} from "../lib/kyc.js";
import { initCtx, log, out, parseIntArg, sendAndReport, signer, withGlobals, type GlobalOptions } from "./common.js";

async function exists(rpc: Parameters<typeof fetchEncodedAccount>[0], a: Address): Promise<boolean> {
	return (await fetchEncodedAccount(rpc, a)).exists;
}

/** One-time: credential (authorized signer = the provider) and the investor-kyc schema. Idempotent. */
async function runSetup(_opts: GlobalOptions, cmd: Command): Promise<void> {
	const { rpc } = await initCtx(cmd);
	const provider = await signer(cmd, "kycProvider");
	if (provider.address !== KYC_PROVIDER) throw new Error(`kyc provider keypair is ${provider.address}, expected ${KYC_PROVIDER}`);
	const ixs: Instruction[] = [];
	if (!(await exists(rpc, KYC_CREDENTIAL))) {
		ixs.push(getCreateCredentialInstruction({ payer: provider, credential: KYC_CREDENTIAL, authority: provider, name: KYC_CREDENTIAL_NAME, signers: [provider.address] }) as unknown as Instruction);
	}
	if (!(await exists(rpc, KYC_SCHEMA))) {
		ixs.push(
			getCreateSchemaInstruction({
				payer: provider,
				authority: provider,
				credential: KYC_CREDENTIAL,
				schema: KYC_SCHEMA,
				name: KYC_SCHEMA_NAME,
				description: "Qupon investor KYC: investor type, residency, withholding tax (bps)",
				layout: KYC_SCHEMA_LAYOUT,
				fieldNames: KYC_SCHEMA_FIELDS,
			}) as unknown as Instruction,
		);
	}
	if (ixs.length === 0) {
		log("credential and schema already exist");
		out({ ok: true, skipped: true, credential: KYC_CREDENTIAL, schema: KYC_SCHEMA });
		return;
	}
	await sendAndReport(rpc, provider, ixs, "kyc:setup", { credential: KYC_CREDENTIAL, schema: KYC_SCHEMA });
}

interface AttestOpts extends GlobalOptions {
	owner: string;
	type: string;
	residency: string;
	taxBps: string;
	expiryDays: string;
}

/** The provider attests one wallet's KYC attributes (nonce = the wallet). Re-attesting an existing wallet is skipped. */
async function runAttest(opts: AttestOpts, cmd: Command): Promise<void> {
	const { rpc } = await initCtx(cmd);
	const provider = await signer(cmd, "kycProvider");
	const owner = address(opts.owner);
	const attestation = await kycAttestationPda(owner);
	if (await exists(rpc, attestation)) {
		log(`attestation for ${owner} already exists`);
		out({ ok: true, skipped: true, attestation, owner });
		return;
	}
	const days = parseIntArg(opts.expiryDays, "--expiry-days");
	const expiry = days === 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
	const data = encodeKycData({
		investorType: opts.type === "legal_entity" ? 1 : 0,
		residency: opts.residency === "nonresident" ? 1 : 0,
		taxRateBps: parseIntArg(opts.taxBps, "--tax-bps"),
	});
	const ix = getCreateAttestationInstruction({ payer: provider, authority: provider, credential: KYC_CREDENTIAL, schema: KYC_SCHEMA, attestation, nonce: owner, data, expiry });
	await sendAndReport(rpc, provider, [ix as unknown as Instruction], "kyc:attest", { attestation, owner, expiry: expiry.toString() });
}

export function registerKycCommands(program: Command): void {
	withGlobals(program.command("kyc:setup").description("KYC provider (SIMULATED): create the SAS credential and investor-kyc schema (once)")).action(runSetup);
	withGlobals(program.command("kyc:attest").description("KYC provider (SIMULATED): attest a wallet's KYC attributes on the Solana Attestation Service"))
		.requiredOption("--owner <address>", "investor wallet")
		.option("--type <t>", "individual | legal_entity", "individual")
		.option("--residency <r>", "resident | nonresident", "resident")
		.option("--tax-bps <n>", "withholding tax in bps", "0")
		.option("--expiry-days <n>", "validity in days (0 = no expiry)", "365")
		.action(runAttest);
}
