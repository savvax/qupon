import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { address } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { getSeriesDecoder } from "../generated/index.js";
import { filterSeriesRows, toSeriesRow, type SeriesRow } from "./series.js";

// Raw Series account (incl. 8-byte discriminator) exported from LiteSVM — 389 bytes,
// i.e. allocated at max size: open_action=None serialized as 1 byte + a 32-byte tail.
const b64 = readFileSync(fileURLToPath(new URL("../../test/fixtures/series.b64", import.meta.url)), "utf8");
const data = new Uint8Array(Buffer.from(b64.trim(), "base64"));

// Field offsets for the open_action=None layout (see generated/accounts/series.ts field order).
const HOOK_OFF = 297; // openAction(1) + openTrades(4) after the 292-byte prefix
const DAY_SECS_OFF = 319; // + recordKind(1) recordSeq(4) recordAt(8) ckptCount(4) ckptLate(4)
const STALE_TAIL_OFF = 357; // first stale byte when open_action went Some → None

function row(over: Partial<SeriesRow>): SeriesRow {
	return {
		pda: address("11111111111111111111111111111111"),
		mint: address("11111111111111111111111111111111"),
		ticker: "",
		isin: "",
		status: "active",
		daySecs: 0,
		hookGate: false,
		actionCount: 0,
		issueDate: 0n,
		maturityDate: 0n,
		...over,
	};
}

describe("series:list row mapping", () => {
	it("maps a decoded Series to a JSON row", () => {
		const s = toSeriesRow(address("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"), getSeriesDecoder().decode(data));
		expect(s).toEqual({
			pda: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
			mint: "BvhCa8xd9TAB7FjpPpMn8x4qQJNfhzmKqSQtA5NgSTG4",
			ticker: "QPNb1",
			isin: "KZ2C0QUPON01",
			status: "active",
			daySecs: 0,
			hookGate: false,
			actionCount: 0,
			issueDate: 1_783_018_800n,
			maturityDate: 1_846_177_200n,
		});
	});

	it("reads the shifted tail fields of a None open_action and ignores the stale 32-byte tail", () => {
		const bytes = new Uint8Array(data); // fresh copy, byteOffset 0
		const view = new DataView(bytes.buffer);
		view.setUint32(DAY_SECS_OFF, 60, true); // demo clock: 1 day = 60s
		bytes[HOOK_OFF] = 1; // transfer-hook gate armed
		view.setUint32(STALE_TAIL_OFF + 16, 99_999, true); // decoy inside the stale tail
		const s = toSeriesRow(address("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd"), getSeriesDecoder().decode(bytes));
		expect(s.daySecs).toBe(60);
		expect(s.hookGate).toBe(true);
	});
});

describe("series:list filter/sort", () => {
	const rows: SeriesRow[] = [
		row({ ticker: "BTRKdemo", status: "active", daySecs: 60 }),
		row({ ticker: "QPNb1", status: "closed" }),
		row({ ticker: "QPNb1", status: "active", pda: address("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd") }),
		row({ ticker: "QPNb1", status: "active", pda: address("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL") }),
		row({ ticker: "KZTb2", status: "matured" }),
	];

	it("--status filters active/closed, all keeps everything", () => {
		expect(filterSeriesRows(rows, "active", false).map(r => r.ticker)).toEqual(["BTRKdemo", "QPNb1", "QPNb1"]);
		expect(filterSeriesRows(rows, "closed", false).map(r => r.ticker)).toEqual(["QPNb1"]);
		expect(filterSeriesRows(rows, "all", false)).toHaveLength(5);
	});

	it("--demo keeps demo-clock series only", () => {
		expect(filterSeriesRows(rows, "all", true).map(r => r.ticker)).toEqual(["BTRKdemo"]);
	});

	it("sorts by ticker, ties broken by PDA ascending, and never mutates the input", () => {
		const sorted = filterSeriesRows(rows, "all", false);
		expect(sorted.map(r => `${r.ticker}:${r.pda.slice(0, 4)}`)).toEqual([
			"BTRKdemo:1111",
			"KZTb2:1111",
			"QPNb1:1111", // closed row
			"QPNb1:ATok",
			"QPNb1:QPN1",
		]);
		expect(rows[0]!.ticker).toBe("BTRKdemo"); // input order untouched
	});
});
