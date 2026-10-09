/**
 * `disclosure:attach` builder (plan 15 D9): sha256 of the notification file's bytes and the
 * generated instruction's account layout — no network.
 */
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AccountRole, address, createNoopSigner } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { ATTACH_DISCLOSURE_DISCRIMINATOR, getAttachDisclosureInstruction } from "../generated/index.js";
import { disclosureHash } from "./disclosure.js";

const SERIES = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
const REGISTRAR = address("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo");

describe("disclosureHash", () => {
	it("hashes the notification file's exact bytes", async () => {
		const dir = mkdtempSync(join(tmpdir(), "qupon-disclosure-"));
		try {
			const file = join(dir, "seev031.xml");
			const bytes = Buffer.from('<SEEv.031 DocType="Notification" CorpActionID="QPNb1-INTR-0001"/>');
			writeFileSync(file, bytes);
			expect(Buffer.from(await disclosureHash(file)).toString("hex")).toBe(
				createHash("sha256").update(bytes).digest("hex"),
			);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});

describe("disclosure:attach builder (attach_disclosure)", () => {
	it("registrar signs, the action is writable, the 32-byte hash rides in the data", () => {
		const hash = new Uint8Array(32).fill(7);
		const ix = getAttachDisclosureInstruction({
			registrar: createNoopSigner(REGISTRAR),
			series: SERIES,
			action: SERIES, // any address — the layout is what matters
			hash,
		});
		const metas = ix.accounts.map(a => ({
			address: a.address,
			role: a.role,
		})); // signer metas carry an extra `signer` prop
		expect(metas).toEqual([
			{ address: REGISTRAR, role: AccountRole.READONLY_SIGNER },
			{ address: SERIES, role: AccountRole.READONLY },
			{ address: SERIES, role: AccountRole.WRITABLE },
		]);
		expect(Array.from(ix.data!.slice(0, 8))).toEqual(Array.from(ATTACH_DISCLOSURE_DISCRIMINATOR));
		expect(Array.from(ix.data!.slice(8))).toEqual(Array.from(hash));
	});
});
