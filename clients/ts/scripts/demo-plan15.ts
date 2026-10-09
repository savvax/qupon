/**
 * `make demo-plan15` — every plan-15 instruction on devnet in one compressed run (task 1519), report in
 * reports/demo-plan15.md: a DEMO-clock series (2 s per civil day, so a coupon period lasts ~6 minutes) on the
 * transfer-hook record date; the crank is pushed by an outsider key (permissionless); one holder takes payouts to a
 * bank account (SIMULATED) confirmed by the paying agent; the coupon defaults and is cured; the notification's
 * sha256 is anchored; a DvP trade carries its accrued interest; the redemption pays and burns atomically.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addressLink, txLink } from "../src/lib/explorer.js";
import { expandHomePath, loadKeypairFromPath } from "../src/lib/keys.js";
import { seriesClock } from "../src/lib/clock.js";
import { loadEnvFile } from "../src/lib/tx.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CLI = join(here, "../src/cli.ts");
const REPORT = join(ROOT, "reports/demo-plan15.md");
const DAY_SECS = 2;

type Json = Record<string, unknown>;
interface Row {
	step: string;
	signatures: string[];
	status: string;
}
interface Section {
	title: string;
	intro: string[];
	rows: Row[];
}

loadEnvFile();
const sections: Section[] = [];
const log = (...a: unknown[]): void => console.error("[demo-plan15]", ...a);
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const keyPath = (v: string): string => {
	const p = process.env[v];
	if (!p) throw new Error(`${v} is not set (see .env.example)`);
	return expandHomePath(p);
};
const as = (v: string): string[] => ["--keypair", keyPath(v)];
const REGISTRAR = "QUPON_REGISTRAR_KEYPAIR";
const ISSUER = "QUPON_ISSUER_KEYPAIR";
const AGENT = "QUPON_PAYING_AGENT_KEYPAIR";
const ANYONE = "QUPON_OUTSIDER_KEYPAIR";
const KYC = "QUPON_KYC_PROVIDER_KEYPAIR";
const INVESTORS = ["QUPON_INVESTOR1_KEYPAIR", "QUPON_INVESTOR2_KEYPAIR", "QUPON_INVESTOR3_KEYPAIR"];
let env: NodeJS.ProcessEnv = process.env;

function section(title: string, intro: string[] = []): void {
	sections.push({ title, intro, rows: [] });
	log(`== ${title}`);
}
const current = (): Section => sections[sections.length - 1] as Section;
function signaturesIn(v: unknown): string[] {
	if (Array.isArray(v)) return v.flatMap(signaturesIn);
	if (v !== null && typeof v === "object")
		return Object.entries(v as Json).flatMap(([k, x]) => (k === "signature" && typeof x === "string" ? [x] : signaturesIn(x)));
	return [];
}
function exec(args: string[], stderr: "inherit" | "pipe" = "inherit"): Json {
	const stdout = execFileSync(process.execPath, ["--import", "tsx", CLI, ...args], { env, encoding: "utf8", stdio: ["ignore", "pipe", stderr], maxBuffer: 64 << 20 });
	const lines = stdout.trim().split("\n").filter(l => l.startsWith("{"));
	return lines.length > 0 ? (JSON.parse(lines[lines.length - 1] ?? "{}") as Json) : {};
}
function step(name: string, args: string[]): Json {
	log(`→ ${name}`);
	try {
		const res = exec(args);
		current().rows.push({ step: name, signatures: signaturesIn(res), status: "ok" });
		return res;
	} catch (e) {
		current().rows.push({ step: name, signatures: [], status: "FAILED" });
		writeReport(`FAILED at "${name}"`);
		throw new Error(`demo-plan15 failed at "${name}"`, { cause: e });
	}
}
function expectFailure(name: string, args: string[], reason: RegExp): void {
	log(`→ ${name} (expected to fail)`);
	try {
		exec(args, "pipe");
	} catch (e) {
		const stderr = String((e as { stderr?: unknown }).stderr ?? "");
		if (!reason.test(stderr)) throw new Error(`${name}: refused, but not with ${reason}: ${stderr.slice(-600)}`, { cause: e });
		current().rows.push({ step: name, signatures: [], status: "rejected as expected ✓" });
		return;
	}
	throw new Error(`${name}: expected the program to refuse it, but it succeeded`);
}
async function until(ts: number, what: string): Promise<void> {
	const ms = ts * 1000 - Date.now();
	if (ms > 0) {
		log(`waiting ${Math.ceil(ms / 1000)} s for ${what}`);
		await sleep(ms + 1500);
	}
}

function writeReport(result: string): void {
	const body = sections.flatMap(s => [
		`## ${s.title}`,
		"",
		...s.intro,
		...(s.intro.length > 0 ? [""] : []),
		"| Step | Transaction | Status |",
		"|---|---|---|",
		...s.rows.map(r => `| ${r.step} | ${r.signatures.length > 0 ? r.signatures.map((x, i) => `[tx${r.signatures.length > 1 ? i + 1 : ""}](${txLink(x)})`).join(" ") : "—"} | ${r.status} |`),
		"",
	]);
	const md = [
		"# Qupon — plan 15 instructions on Solana devnet (`make demo-plan15`)",
		"",
		`Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](${addressLink("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd")}) · cluster devnet · run ${new Date().toISOString()}`,
		"",
		`**Result:** ${result}`,
		"",
		`_DEMO clock: one civil day = ${DAY_SECS} s on this series (labelled DEMO everywhere), so a semi-annual coupon period lasts ~6 minutes and the default grace (one series day) is ${DAY_SECS} s. Bank transfers are SIMULATED: the payout goes to the paying agent's cash account and the agent confirms it with a reference hash._`,
		"",
		...body,
	].join("\n");
	mkdirSync(dirname(REPORT), { recursive: true });
	writeFileSync(REPORT, md);
}

interface SeriesData {
	daySecs: number;
	issueDate: string;
	issueYmd: number;
	periodStart: string;
	maturityDate: string;
}
const seriesData = (name: string): SeriesData =>
	(exec(["state:dump", "--series", name, "--no-entitlements"], "pipe") as { series: { data: SeriesData } }).series.data;

async function main(): Promise<void> {
	const base = JSON.parse(readFileSync(join(ROOT, "config/devnet.json"), "utf8")) as Json;
	const id = Math.floor(Date.now() / 1000).toString(36);
	const name = `QPNd-${id}`;
	const short = id.slice(-4);
	const runCfg = join(ROOT, `logs/demo-plan15-${id}.json`);
	mkdirSync(dirname(runCfg), { recursive: true });
	writeFileSync(runCfg, JSON.stringify(base, null, 2));
	env = { ...process.env, QUPON_CONFIG: runCfg };
	const inv = await Promise.all(INVESTORS.map(async v => (await loadKeypairFromPath(keyPath(v))).address));
	const [inv1, inv2, inv3] = [inv[0] as string, inv[1] as string, inv[2] as string];
	const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
	const maturity = `${Number(today.slice(0, 4)) + 1}${today.slice(4)}`;

	section("P0 — A series on the DEMO clock, transfer-hook record date", [
		`- Series **${name}**: face 1,000 KZT, 10% semi-annual, 30E/360, ${today} → ${maturity} on a ${DAY_SECS} s/day DEMO clock; investor1 10, investor2 25, investor3 65 bonds.`,
	]);
	step(`series:create --demo-day-secs ${DAY_SECS} (mint with transfer hook + init_series + init_hook)`, [
		"series:create", "--name", name, "--isin", "KZ2C0QPND001", "--face", "100000", "--rate-bps", "1000", "--frequency", "2",
		"--day-count", "THIRTY_360", "--issue-date", today, "--maturity-date", maturity, "--cash", "tkzt", "--demo-day-secs", String(DAY_SECS), ...as(REGISTRAR),
	]);
	for (const [k, owner] of inv.entries()) {
		step(`kyc:attest investor${k + 1} (SIMULATED KYC provider, SAS attestation)`, ["kyc:attest", "--owner", owner, ...as(KYC)]);
		step(`investor:register investor${k + 1}`, ["investor:register", "--series", name, "--owner", owner, ...as(REGISTRAR)]);
	}
	for (const [k, units] of [10, 25, 65].entries()) step(`subscribe ${units} bonds — investor${k + 1}`, ["subscribe", "--series", name, "--units", String(units), ...as(INVESTORS[k] ?? "")]);

	section("P1 — The holder chooses where payouts go (plan 15 D6)", [
		"Only the holder's own signature sets the route (`has_one = owner`; the registrar cannot redirect it — `programs/qupon_bonds/tests/payout_route.rs`). investor2 asks for a bank account (only the sha256 of the details goes on-chain).",
	]);
	step("payout:route bank — signed by investor2", ["payout:route", "--series", name, "--route", "bank", "--bank-ref", "KZ86 125K ZT50 0410 0100 (SIMULATED)", ...as(INVESTORS[1] ?? "")]);

	section("P2 — Coupon INTR #1: anchored notice, permissionless crank, default and cure (plan 15 D2, D4, D9)", [
		"The record date arms the transfer-hook gate (the register never pauses). Every crank step is pushed by an outsider key. The issuer misses the payment date; one series day later anyone declares the default; the issuer's late funding cures it and the record-date holders are paid.",
	]);
	let s = seriesData(name);
	const clock = seriesClock({ daySecs: s.daySecs, issueDate: BigInt(s.issueDate), issueYmd: s.issueYmd });
	const couponEnd = clock.addMonths(Number(s.periodStart), 6);
	const recordAt = Math.max(couponEnd - DAY_SECS, Math.floor(Date.now() / 1000) + 40);
	const paymentAt = Math.max(couponEnd + DAY_SECS, recordAt + 10);
	const ann = step("action:announce INTR #1 (registrar)", ["action:announce", "--series", name, "--kind", "INTR", "--record-at", String(recordAt), "--payment-at", String(paymentAt), "--corp-id", `D${short}-INTR-0001`, ...as(REGISTRAR)]);
	const notice = join(ROOT, `logs/notice-D${short}-INTR-0001.json`);
	writeFileSync(notice, JSON.stringify({ corpId: `D${short}-INTR-0001`, series: name, action: ann.action, kind: "INTR", recordAt, paymentAt, rateBps: 1000 }, null, 2));
	const hash = createHash("sha256").update(readFileSync(notice)).digest("hex");
	step(`disclosure:attach — sha256 ${hash.slice(0, 16)}… of the notice anchored once (registrar)`, ["disclosure:attach", "--series", name, "--file", notice, ...as(REGISTRAR)]);
	expectFailure("disclosure:attach again — AlreadyAttached", ["disclosure:attach", "--series", name, "--file", notice, ...as(REGISTRAR)], /AlreadyAttached|0x17[0-9a-f]{2}/i);
	await until(recordAt, "the record date (transfer-hook gate arms)");
	step("action:snapshot — pushed by an outsider (permissionless, set hash)", ["action:snapshot", "--series", name, ...as(ANYONE)]);
	step("action:finalize-snapshot — outsider", ["action:finalize-snapshot", "--series", name, ...as(ANYONE)]);
	await until(paymentAt, "the payment date (issuer does not fund)");
	await sleep(DAY_SECS * 1000 + 2000);
	step("action:default — outsider declares the default (payment date + one series day, escrow short)", ["action:default", "--series", name, ...as(ANYONE)]);
	step("action:fund — the issuer's late funding cures the default", ["action:fund", "--series", name, ...as(ISSUER)]);
	step("action:pay — outsider; investor2's coupon goes to the paying agent (bank route)", ["action:pay", "--series", name, ...as(ANYONE)]);
	expectFailure("action:complete before the bank payout is confirmed — BankPayoutsPending", ["action:complete", "--series", name, ...as(ANYONE)], /BankPayoutsPending|0x17[0-9a-f]{2}/i);
	step("payout:confirm-bank — paying agent confirms investor2's transfer (reference hash; transfer SIMULATED)", ["payout:confirm-bank", "--series", name, "--owner", inv2, "--reference", `SWIFT-D${short}-0001 (SIMULATED)`, ...as(AGENT)]);
	step("action:complete — outsider (reconciled: all paid, nothing pending)", ["action:complete", "--series", name, ...as(ANYONE)]);

	section("P3 — Secondary trade carries its accrued interest (task 1515)", [
		"investor3 sells 5 bonds at par to investor1 through Solana DvP; `admit_trade` emits `TradeAccrued` (clean + accrued = cash leg) on the series' day count.",
	]);
	const t = step("trade:create — CreateDvp + admit_trade (TradeAccrued)", ["trade:create", "--series", name, "--seller", inv3, "--buyer", inv1, "--units", "5", ...as(REGISTRAR)]);
	current().intro.push(`- Cash leg ${String(t.cashAmount)} = clean ${String(t.clean)} + accrued ${String(t.accrued)} (${String(t.accruedDays)} days).`);
	step("trade:fund seller — investor3", ["trade:fund", "--series", name, "--trade", String(t.swapDvp), "--side", "seller", ...as(INVESTORS[2] ?? "")]);
	step("trade:fund buyer — investor1", ["trade:fund", "--series", name, "--trade", String(t.swapDvp), "--side", "buyer", ...as(INVESTORS[0] ?? "")]);
	step("trade:settle — SettleDvp + release_trade", ["trade:settle", "--series", name, "--trade", String(t.swapDvp), ...as(REGISTRAR)]);

	section("P4 — Redemption: pay and burn in one instruction (plan 15 D5)", [
		"At maturity every holder's principal + final coupon is paid and their units are burned in the same `pay_batch`; investor2's redemption goes through the bank route and is confirmed by the agent.",
	]);
	s = seriesData(name);
	const mat = Number(s.maturityDate);
	const rRecord = Math.max(mat - DAY_SECS, Math.floor(Date.now() / 1000) + 40);
	const rPay = Math.max(mat + DAY_SECS, rRecord + 10);
	step("action:announce REDM (registrar)", ["action:announce", "--series", name, "--kind", "REDM", "--record-at", String(rRecord), "--payment-at", String(rPay), "--corp-id", `D${short}-REDM-0002`, ...as(REGISTRAR)]);
	await until(rRecord, "the redemption record date");
	step("action:snapshot — outsider", ["action:snapshot", "--series", name, ...as(ANYONE)]);
	step("action:finalize-snapshot — outsider", ["action:finalize-snapshot", "--series", name, ...as(ANYONE)]);
	step("action:fund — issuer", ["action:fund", "--series", name, ...as(ISSUER)]);
	step("action:pay — outsider: pay + burn atomically", ["action:pay", "--series", name, ...as(ANYONE)]);
	step("payout:confirm-bank — paying agent (investor2, SIMULATED transfer)", ["payout:confirm-bank", "--series", name, "--owner", inv2, "--reference", `SWIFT-D${short}-0002 (SIMULATED)`, ...as(AGENT)]);
	step("action:complete — outsider", ["action:complete", "--series", name, ...as(ANYONE)]);
	step("action:retire — nothing left to burn (no double count)", ["action:retire", "--series", name, ...as(ANYONE)]);
	step("series:close — metadata REDEEMED, mint closed", ["series:close", "--series", name, ...as(REGISTRAR)]);

	writeReport("every plan-15 instruction succeeded on devnet ✓ (demo clock, hook record date, permissionless crank, payout route + bank confirmation, disclosure anchoring, default + cure, accrued interest on a DvP trade, atomic pay + burn)");
	log(`report written to ${REPORT}`);
	console.log(JSON.stringify({ ok: true, series: name, report: REPORT, transactions: sections.flatMap(x => x.rows).reduce((n, r) => n + r.signatures.length, 0) }));
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
