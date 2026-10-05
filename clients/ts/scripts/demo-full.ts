/**
 * `make demo` — the full lifecycle on Solana devnet (scenarios S0–S4), driven only through the `qupon` CLI.
 * Writes reports/demo-full.md: one section per scenario, every transaction linked, entitlement tables and balances.
 *
 * QPNb1-<id> (tKZT, 2 years, 10% semi-annual): S0 issuance + registry gating → S1 INTR #1 at 10% → S3 bondholder
 * meeting raising the coupon to 12% → INTR #2 and #3 at 12% → S2 REDM (principal + final coupon) → retire → close.
 * BTRK-<id> (USDC, 15.95%, scaled to devnet faucet limits: face 1 USDC): S0 → INTR #1 → S4 MCAL after 47 days →
 * retire → close. Time is compressed (record date ≈ +45 s after each announcement); the math uses real civil dates.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { address, type Address } from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token-2022";
import { listEntitlements, tokenProgramOfMint } from "../src/commands/common.js";
import { addressLink, txLink } from "../src/lib/explorer.js";
import { formatMinor } from "../src/lib/format.js";
import { expandHomePath, loadKeypairFromPath } from "../src/lib/keys.js";
import { createRpc, loadEnvFile } from "../src/lib/tx.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CLI = join(here, "../src/cli.ts");
const BOND_MINT_SCRIPT = join(here, "create-bond-mint.ts");
const REPORT = join(ROOT, "reports/demo-full.md");

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
  tables: string[];
}

loadEnvFile();
const rpc = createRpc();
const sections: Section[] = [];
const log = (...a: unknown[]): void => console.error("[demo-full]", ...a);
const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));
const keyPath = (env: string): string => {
  const p = process.env[env];
  if (!p) throw new Error(`${env} is not set (see .env.example)`);
  return expandHomePath(p);
};
const as = (env: string): string[] => ["--keypair", keyPath(env)];
const REGISTRAR = "QUPON_REGISTRAR_KEYPAIR";
const ISSUER = "QUPON_ISSUER_KEYPAIR";
const KYC_PROVIDER = "QUPON_KYC_PROVIDER_KEYPAIR";
const INVESTORS = ["QUPON_INVESTOR1_KEYPAIR", "QUPON_INVESTOR2_KEYPAIR", "QUPON_INVESTOR3_KEYPAIR"];

function section(title: string, intro: string[] = []): Section {
  const s = { title, intro, rows: [], tables: [] };
  sections.push(s);
  log(`== ${title}`);
  return s;
}
const current = (): Section => sections[sections.length - 1] as Section;

function signaturesIn(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(signaturesIn);
  if (v !== null && typeof v === "object") {
    return Object.entries(v as Json).flatMap(([k, x]) => (k === "signature" && typeof x === "string" ? [x] : signaturesIn(x)));
  }
  return [];
}

let env: NodeJS.ProcessEnv = process.env;

function exec(script: string, args: string[]): Json {
  const stdout = execFileSync(process.execPath, ["--import", "tsx", script, ...args], {
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  const lines = stdout.trim().split("\n").filter(l => l.startsWith("{"));
  return lines.length > 0 ? (JSON.parse(lines[lines.length - 1] ?? "{}") as Json) : {};
}

function step(name: string, args: string[], script = CLI): Json {
  log(`→ ${name}`);
  try {
    const res = exec(script, args);
    current().rows.push({ step: name, signatures: signaturesIn(res), status: "ok" });
    return res;
  } catch (e) {
    current().rows.push({ step: name, signatures: [], status: "FAILED" });
    writeReport(`FAILED at "${name}"`);
    throw new Error(`demo-full failed at step "${name}" (CLI logs above)`, { cause: e });
  }
}

function expectFailure(name: string, args: string[]): void {
  log(`→ ${name} (expected to fail)`);
  try {
    exec(CLI, args);
  } catch {
    current().rows.push({ step: name, signatures: [], status: "rejected as expected ✓" });
    return;
  }
  throw new Error(`${name}: expected the program to refuse it, but it succeeded`);
}

/** Wait for the record date, then strike (retry while the cluster clock catches up). */
async function strikeWhenDue(series: string): Promise<void> {
  await sleep(50_000);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = exec(CLI, ["action:strike", "--series", series, ...as(REGISTRAR)]);
      current().rows.push({ step: "action:strike — record date: register frozen (mint paused)", signatures: signaturesIn(res), status: "ok" });
      return;
    } catch (e) {
      if (attempt >= 8) throw new Error("action:strike kept failing", { cause: e });
      log(`strike attempt ${attempt} too early — retrying in 8 s`);
      await sleep(8_000);
    }
  }
}

/** Cash balance; 0 only if the account does not exist — transient RPC errors are retried, never read as 0. */
async function cashBalance(mint: Address, owner: Address): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({ owner, mint, tokenProgram: await tokenProgramOfMint(rpc, mint) });
  for (let attempt = 1; ; attempt++) {
    try {
      const info = await rpc.getAccountInfo(ata, { encoding: "base64", commitment: "confirmed" }).send();
      if (info.value === null) return 0n;
      return BigInt((await rpc.getTokenAccountBalance(ata, { commitment: "confirmed" }).send()).value.amount);
    } catch (e) {
      if (attempt >= 5) throw new Error(`balance of ${ata} unreadable`, { cause: e });
      await sleep(1_500 * attempt);
    }
  }
}

interface Ctx {
  series: string;
  cashMint: Address;
  decimals: number;
  ccy: string;
  investors: { label: string; address: Address; units: bigint }[];
}

const fmt = (c: Ctx, v: bigint): string => formatMinor(v, c.decimals, c.ccy);

/** announce → record date → snapshot → finalize → fund → pay → complete; returns the action address. */
async function cashAction(c: Ctx, kindArgs: string[], label: string, corpId: string, expectGrossPerUnit?: bigint): Promise<Address> {
  const before = await Promise.all(c.investors.map(i => cashBalance(c.cashMint, i.address)));
  const ann = step(`action:announce ${label}`, ["action:announce", "--series", c.series, ...kindArgs, "--record-at", "+45", "--payment-at", "+60", "--corp-id", corpId, ...as(REGISTRAR)]);
  const action = address(String(ann.action));
  await strikeWhenDue(c.series);
  step("action:snapshot — one Entitlement per holder, sha256 chain", ["action:snapshot", "--series", c.series, ...as(REGISTRAR)]);
  step("action:finalize-snapshot — Σ units == supply, rounding bound", ["action:finalize-snapshot", "--series", c.series, ...as(REGISTRAR)]);
  step("action:fund — issuer pre-funds the escrow (net + tax + principal)", ["action:fund", "--series", c.series, ...as(ISSUER)]);
  step("action:pay — holders paid from escrow (action PDA signs)", ["action:pay", "--series", c.series, ...as(REGISTRAR)]);
  step("action:complete — reconcile, resume register", ["action:complete", "--series", c.series, ...as(REGISTRAR)]);
  const after = await Promise.all(c.investors.map(i => cashBalance(c.cashMint, i.address)));
  const ents = new Map((await listEntitlements(rpc, action)).map(e => [e.owner as string, e]));
  const rows = c.investors.map((inv, k) => {
    const e = ents.get(inv.address);
    if (e === undefined) throw new Error(`${label}: no entitlement for ${inv.label}`);
    const received = (after[k] ?? 0n) - (before[k] ?? 0n);
    if (received !== e.net + e.principal) throw new Error(`${label}: ${inv.label} received ${received}, entitled ${e.net + e.principal}`);
    if (expectGrossPerUnit !== undefined && e.gross !== expectGrossPerUnit * e.units) {
      throw new Error(`${label}: ${inv.label} gross ${e.gross} ≠ ${expectGrossPerUnit} × ${e.units}`);
    }
    return `| ${inv.label} | ${e.units} | ${fmt(c, e.gross)} | ${fmt(c, e.tax)} | ${fmt(c, e.net)} | ${fmt(c, e.principal)} | ${fmt(c, received)} ✓ |`;
  });
  current().tables.push(
    `**${label}** — action [${action.slice(0, 8)}…](${addressLink(action)})`,
    "",
    "| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |",
    "|---|---|---|---|---|---|---|",
    ...rows,
    "",
  );
  return action;
}

async function issue(name: string, units: bigint[], issueDate: string, maturityDate: string, ccy: string, decimals: number): Promise<Ctx> {
  const mint = step("create Token-2022 bond mint (extensions validated by init_series)", ["--series", name], BOND_MINT_SCRIPT);
  current().intro.push(`- Bond mint: [${String(mint.mint)}](${addressLink(String(mint.mint))})`);
  step("series:init", ["series:init", "--series", name, "--issue-date", issueDate, "--maturity-date", maturityDate, ...as(REGISTRAR)]);
  const investors = await Promise.all(
    INVESTORS.map(async (envVar, i) => ({ envVar, label: `investor${i + 1}`, address: (await loadKeypairFromPath(keyPath(envVar))).address, units: units[i] ?? 0n })),
  );
  // KYC: the (SIMULATED) provider attests each wallet on the Solana Attestation Service; register_investor checks it.
  for (const inv of investors) step(`kyc:attest ${inv.label} — SAS attestation by the KYC provider`, ["kyc:attest", "--owner", inv.address, ...as(KYC_PROVIDER)]);
  for (const inv of investors) step(`investor:register ${inv.label} (checks the SAS attestation)`, ["investor:register", "--series", name, "--owner", inv.address, ...as(REGISTRAR)]);
  expectFailure("subscribe from an unregistered wallet (frozen-by-default token account)", ["subscribe", "--series", name, "--units", "1", ...as("QUPON_OUTSIDER_KEYPAIR")]);
  for (const inv of investors) step(`subscribe ${inv.units} bonds — DvP ${inv.label}`, ["subscribe", "--series", name, "--units", String(inv.units), ...as(inv.envVar)]);
  const cfg = JSON.parse(readFileSync(String(env.QUPON_CONFIG), "utf8")) as { tkztMint: string; usdcMint: string };
  return { series: name, cashMint: address(ccy === "USDC" ? cfg.usdcMint : cfg.tkztMint), decimals, ccy, investors };
}

function writeReport(result: string): void {
  const body = sections.flatMap(s => [
    `## ${s.title}`,
    "",
    ...s.intro,
    s.intro.length > 0 ? "" : "",
    "| Step | Transaction | Status |",
    "|---|---|---|",
    ...s.rows.map(r => `| ${r.step} | ${r.signatures.length > 0 ? r.signatures.map((x, i) => `[tx${r.signatures.length > 1 ? i + 1 : ""}](${txLink(x)})`).join(" ") : "—"} | ${r.status} |`),
    "",
    ...s.tables,
  ]);
  const product = readFileSync(join(ROOT, "docs/01-product.md"), "utf8");
  const ivs = product.slice(product.indexOf("| Element | Status |"), product.indexOf("## Non-goals")).trim();
  const md = [
    "# Qupon — full lifecycle on Solana devnet (`make demo`)",
    "",
    `Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](${addressLink("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd")}) · cluster devnet · run ${new Date().toISOString()}`,
    "",
    `**Result:** ${result}`,
    "",
    "_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._",
    "",
    ...body,
    "## Implemented vs simulated",
    "",
    ivs,
    "",
  ].join("\n");
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, md);
}

async function main(): Promise<void> {
  const base = JSON.parse(readFileSync(join(ROOT, "config/devnet.json"), "utf8")) as { series: Record<string, Json> };
  const demo = JSON.parse(readFileSync(join(ROOT, "config/demo.json"), "utf8")) as {
    series: { QPNb1: { issueDate: string; maturityDate: string }; BTRKdemo: { issueDate: string; maturityDate: string; mcal: { callDate: string } } };
  };
  const id = Math.floor(Date.now() / 1000).toString(36);
  const qpn = `QPNb1-${id}`;
  const btrk = `BTRK-${id}`;
  const runCfg = join(ROOT, `logs/demo-full-${id}.json`);
  mkdirSync(dirname(runCfg), { recursive: true });
  writeFileSync(runCfg, JSON.stringify({ ...base, series: { ...base.series, [qpn]: { ...base.series.QPNb1, mint: "" }, [btrk]: { ...base.series.BTRKdemo, mint: "" } } }, null, 2));
  env = { ...process.env, QUPON_CONFIG: runCfg };
  const short = id.slice(-4);

  // ---- QPNb1 in tKZT ----
  section("S0 — Issuance and holder registry (QPNb1, tKZT)", [`- Series **${qpn}**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, ${demo.series.QPNb1.issueDate} → ${demo.series.QPNb1.maturityDate}`]);
  const q = await issue(qpn, [10n, 25n, 65n], demo.series.QPNb1.issueDate, demo.series.QPNb1.maturityDate, "tKZT", 2);

  if (process.env.DEMO_UI === "1") {
    // `make demo-ui`: stop after announcing INTR #1 — every later step is clicked in the console (/actions/<pda>).
    const ann = step("action:announce INTR #1 (driven from the UI)", ["action:announce", "--series", qpn, "--kind", "INTR", "--record-at", "+180", "--payment-at", "+240", "--corp-id", `Q${short}-INTR-0001`, ...as(REGISTRAR)]);
    log(`next: QUPON_CONFIG=${runCfg} make api   ·   NEXT_PUBLIC_API_URL=http://localhost:8080 make web   ·   open /actions/${String(ann.action)}`);
    console.log(JSON.stringify({ ok: true, series: qpn, mint: (JSON.parse(readFileSync(runCfg, "utf8")) as { series: Record<string, { mint: string }> }).series[qpn]?.mint, action: ann.action, config: runCfg }));
    return;
  }

  section("S1 — Coupon payment INTR #1 at 10%", ["Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00."]);
  await cashAction(q, ["--kind", "INTR"], "INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)", `Q${short}-INTR-0001`, 5_000n);

  section("S3 — Bondholder meeting → coupon 10% → 12% (terms change)", ["Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED)."]);
  step("meeting:announce — issuer proposes 12%", ["meeting:announce", "--series", qpn, "--record-at", "+45", "--voting-ends-at", "+600", "--new-rate-bps", "1200", "--corp-id", `Q${short}-BMET-0002`, ...as(ISSUER)]);
  await strikeWhenDue(qpn);
  step("action:snapshot — voting weights", ["action:snapshot", "--series", qpn, ...as(REGISTRAR)]);
  step("action:finalize-snapshot — voting opens (register resumes)", ["action:finalize-snapshot", "--series", qpn, ...as(REGISTRAR)]);
  step("vote For — investor3 (65 bonds)", ["vote", "--series", qpn, "--choice", "for", ...as(INVESTORS[2] ?? "")]);
  step("vote Against — investor2 (25 bonds)", ["vote", "--series", qpn, "--choice", "against", ...as(INVESTORS[1] ?? "")]);
  step("vote Abstain — investor1 (10 bonds)", ["vote", "--series", qpn, "--choice", "abstain", ...as(INVESTORS[0] ?? "")]);
  step("meeting:finalize — Approved", ["meeting:finalize", "--series", qpn, ...as(REGISTRAR)]);
  step("meeting:apply — coupon_rate_bps 1200 on the series and in token metadata", ["meeting:apply", "--series", qpn, ...as(REGISTRAR)]);

  section("S1 (cont.) — Coupons at the new rate", ["INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00."]);
  await cashAction(q, ["--kind", "INTR"], "INTR #2 (2027-01-03 → 2027-07-03, 12%)", `Q${short}-INTR-0003`, 6_000n);
  await cashAction(q, ["--kind", "INTR"], "INTR #3 (2027-07-03 → 2028-01-03, 12%)", `Q${short}-INTR-0004`, 6_000n);

  section("S2 — Redemption at maturity (principal + final coupon), burn, close", ["10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED)."]);
  await cashAction(q, ["--kind", "REDM"], "REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)", `Q${short}-REDM-0005`, 6_000n);
  step("action:retire — burn every unit (permanent delegate)", ["action:retire", "--series", qpn, ...as(REGISTRAR)]);
  step("series:close — metadata REDEEMED, mint closed, series Closed", ["series:close", "--series", qpn, ...as(REGISTRAR)]);

  // ---- BTRK-demo in USDC ----
  section("S0 — Second series in USDC (BTRK-demo, 15.95%)", [`- Series **${btrk}** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.`]);
  const b = await issue(btrk, [3n, 3n, 4n], demo.series.BTRKdemo.issueDate, demo.series.BTRKdemo.maturityDate, "USDC", 6);
  section("S1 — USDC coupon INTR #1 at 15.95%");
  await cashAction(b, ["--kind", "INTR"], "INTR #1 (180 days, 15.95%)", `B${short}-INTR-0001`, 79_750n);
  section("S4 — Early redemption (MCAL) with 47 accrued days, burn, close", ["Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder."]);
  await cashAction(b, ["--kind", "MCAL", "--call-date", "2027-02-20"], "MCAL (2027-01-03 → 2027-02-20, 47 days)", `B${short}-MCAL-0002`);
  step("action:retire", ["action:retire", "--series", btrk, ...as(REGISTRAR)]);
  step("series:close", ["series:close", "--series", btrk, ...as(REGISTRAR)]);

  writeReport("all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)");
  log(`report written to ${REPORT}`);
  console.log(JSON.stringify({ ok: true, series: [qpn, btrk], report: REPORT, transactions: sections.flatMap(s => s.rows).reduce((n, r) => n + r.signatures.length, 0) }));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
