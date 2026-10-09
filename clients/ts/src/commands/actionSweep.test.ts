/**
 * `action:sweep` (task 1414): argv parsing through commander, and the
 * "already swept" branch — a closed escrow account prints
 * {ok:true, skipped:"already swept"} on stdout and exits 0.
 */
import { Command } from "commander";
import { address, generateKeyPairSigner, type Address } from "@solana/kit";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionPda } from "../lib/pda.js";
import type { QuponRpc } from "../lib/tx.js";
import type { CorporateAction, Series } from "../generated/index.js";
import { loadSeries, type SeriesInfo } from "./common.js";
import { registerActionCommands } from "./action.js";

const ESCROW = address("Escrow11111111111111111111111111111111111111");

// Hoisted shared fakes: the vi.mock factories below run before the module body.
const h = vi.hoisted(() => ({
	rpc: { getAccountInfo: vi.fn() },
	info: {} as SeriesInfo,
	action: {} as CorporateAction,
}));

vi.mock("./common.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("./common.js")>();
	return {
		...actual,
		initCtx: vi.fn(async () => ({
			rpc: h.rpc as unknown as QuponRpc,
			cfg: {},
		})),
		loadSeries: vi.fn(async () => h.info),
		signer: vi.fn(async () => generateKeyPairSigner()),
	};
});

vi.mock("../generated/index.js", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../generated/index.js")>();
	return {
		...actual,
		fetchCorporateAction: vi.fn(async () => ({ data: h.action })),
	};
});

describe("action:sweep", () => {
	beforeEach(async () => {
		const mint = address("Mint111111111111111111111111111111111111111");
		h.rpc.getAccountInfo.mockReset();
		h.info = {
			name: "QPNb1",
			sc: {},
			mint,
			pda: await actionPda(mint, 0), // any series PDA; the action index selects the action
			account: { openAction: null } as unknown as Series,
		};
		h.action = {
			escrow: ESCROW,
			status: 5 /* Completed */,
		} as unknown as CorporateAction;
	});

	it("parses --series/--index and skips with ok:true, exit 0 when the escrow is already swept", async () => {
		// fake rpc: the escrow account no longer exists (sweep_escrow closes it)
		h.rpc.getAccountInfo.mockReturnValue({
			send: async () => ({ value: null }),
		});

		const program = new Command();
		registerActionCommands(program);
		const printed = vi.spyOn(console, "log").mockImplementation(() => {});
		const logged = vi.spyOn(console, "error").mockImplementation(() => {});
		try {
			const argv = [
				"node",
				"qupon",
				"action:sweep",
				"--series",
				"QPNb1",
				"--index",
				"3",
			];
			await program.parseAsync(argv);

			// argv reached the wiring: series name and the action index routed to the action PDA
			expect(loadSeries).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				"QPNb1",
			);
			const wantAction = await actionPda(h.info.pda, 3);
			expect(printed.mock.calls).toHaveLength(1);
			expect(JSON.parse(printed.mock.calls[0]![0] as string)).toEqual({
				ok: true,
				command: "action:sweep",
				action: wantAction as Address,
				skipped: "already swept",
			});
			// the escrow was checked on chain before deciding
			expect(h.rpc.getAccountInfo).toHaveBeenCalledWith(
				ESCROW,
				expect.anything(),
			);
			expect(process.exitCode).toBeUndefined(); // exit 0 — an already-swept escrow is not a failure
		} finally {
			printed.mockRestore();
			logged.mockRestore();
		}
	});
});
