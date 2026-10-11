/** `kyc:setup`, `kyc:attest` — the (SIMULATED) KYC provider issues Solana Attestation Service attestations. */
import { type Address, type Instruction, type KeyPairSigner, type ReadonlyUint8Array, address, fetchEncodedAccount } from "@solana/kit";
import type { Command } from "commander";
import { decodeAttestation, getCloseAttestationInstruction, getCreateAttestationInstruction, getCreateCredentialInstruction, getCreateSchemaInstruction } from "sas-lib";
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
	kycDataEquals,
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
		// SAFETY: sas-lib is generated for a @solana/kit major older than ours; the instruction shape is identical.
		ixs.push(getCreateCredentialInstruction({ payer: provider, credential: KYC_CREDENTIAL, authority: provider, name: KYC_CREDENTIAL_NAME, signers: [provider.address] }) as unknown as Instruction);
	}
	if (!(await exists(rpc, KYC_SCHEMA))) {
		// SAFETY: same sas-lib/kit version skew as the credential instruction above.
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
	replace: boolean;
}

/** The provider attests one wallet's KYC attributes (nonce = the wallet). With --replace, an attestation whose data
 * differs is closed (SAS close-attestation, the provider as the authority) and re-created in one transaction; equal
 * data is skipped as today — register_investor requires attestation data == registration (task 91540). */
async function runAttest(opts: AttestOpts, cmd: Command): Promise<void> {
	const { rpc } = await initCtx(cmd);
	const provider = await signer(cmd, "kycProvider");
	const owner = address(opts.owner);
	const attestation = await kycAttestationPda(owner);
	const days = parseIntArg(opts.expiryDays, "--expiry-days");
	const expiry = days === 0 ? 0n : BigInt(Math.floor(Date.now() / 1000) + days * 86_400);
	const plan = planAttest(
		opts.type === "legal_entity" ? 1 : 0,
		opts.residency === "nonresident" ? 1 : 0,
		parseIntArg(opts.taxBps, "--tax-bps"),
		opts.replace,
		await existingAttestationData(rpc, attestation),
		{ provider, owner, attestation, expiry },
	);
	if (plan.skip) {
		log(plan.reason);
		out({ ok: true, skipped: true, attestation, owner, replaced: false });
		return;
	}
	await sendAndReport(rpc, provider, plan.instructions, "kyc:attest", {
		attestation,
		owner,
		expiry: expiry.toString(),
		replaced: plan.replaced,
	});
}

/** The existing attestation's KYC data, or null when the owner has none yet: kit's own fetch + sas-lib's pure
 * decoder, so the kit-major skew never reaches the Rpc type. */
async function existingAttestationData(rpc: Parameters<typeof fetchEncodedAccount>[0], a: Address): Promise<ReadonlyUint8Array | null> {
	const acc = await fetchEncodedAccount(rpc, a);
	return acc.exists ? decodeAttestation(acc).data.data : null;
}

export interface AttestPlan {
	/** No transaction needed: data unchanged, or differing data without --replace. */
	skip: boolean;
	reason: string;
	replaced: boolean;
	instructions: Instruction[];
}

/** Pure attestation decision (unit-tested without a network): create when absent, skip when the data is equal,
 * close + re-create in one transaction when --replace is given and the data differs. */
export function planAttest(
	investorType: number,
	residency: number,
	taxRateBps: number,
	replace: boolean,
	existing: ReadonlyUint8Array | null,
	accounts: { provider: KeyPairSigner; owner: Address; attestation: Address; expiry: bigint },
): AttestPlan {
	const data = encodeKycData({ investorType, residency, taxRateBps });
	// SAFETY: sas-lib is generated for a @solana/kit major older than ours; the instruction shape is identical.
	const create = () =>
		getCreateAttestationInstruction({
			payer: accounts.provider, authority: accounts.provider, credential: KYC_CREDENTIAL, schema: KYC_SCHEMA,
			attestation: accounts.attestation, nonce: accounts.owner, data, expiry: accounts.expiry,
		}) as unknown as Instruction;
	if (existing === null) return { skip: false, reason: "", replaced: false, instructions: [create()] };
	if (kycDataEquals(existing, data)) {
		return { skip: true, reason: `attestation for ${accounts.owner} already exists with the same data`, replaced: false, instructions: [] };
	}
	if (!replace) {
		return { skip: true, reason: `attestation for ${accounts.owner} exists with different data (pass --replace to re-attest)`, replaced: false, instructions: [] };
	}
	return {
		skip: false,
		reason: `re-attesting ${accounts.owner} with new data`,
		replaced: true,
		instructions: [
			// SAFETY: same sas-lib/kit version skew as the create instruction above.
			getCloseAttestationInstruction({
				payer: accounts.provider, authority: accounts.provider, credential: KYC_CREDENTIAL, attestation: accounts.attestation,
			}) as unknown as Instruction,
			create(),
		],
	};
}

export function registerKycCommands(program: Command): void {
	withGlobals(program.command("kyc:setup").description("KYC provider (SIMULATED): create the SAS credential and investor-kyc schema (once)")).action(runSetup);
	withGlobals(program.command("kyc:attest").description("KYC provider (SIMULATED): attest a wallet's KYC attributes on the Solana Attestation Service"))
		.requiredOption("--owner <address>", "investor wallet")
		.option("--type <t>", "individual | legal_entity", "individual")
		.option("--residency <r>", "resident | nonresident", "resident")
		.option("--tax-bps <n>", "withholding tax in bps", "0")
		.option("--expiry-days <n>", "validity in days (0 = no expiry)", "365")
		.option("--replace", "re-attest when an attestation exists with different data (close + create)")
		.action(runAttest);
}
