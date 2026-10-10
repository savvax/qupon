/**
 * `make demo-coupon` — required scenario 1 (coupon payment) end-to-end on Solana devnet, driven through the
 * `qupon` CLI so the run also proves the CLI. Writes reports/demo-coupon.md with an explorer link per transaction.
 *
 * Every run creates a fresh series `QPNb1-<id>` (own config copy via QUPON_CONFIG), registers investor1..3,
 * shows that an unregistered wallet is refused, places 10/25/65 bonds by DvP, announces INTR #1
 * (2026-07-03 → 2027-01-03, 10%, 30/360 = 180 days), and runs record date → snapshot → fund → pay → complete.
 * Time is compressed: record date = now + 90 s, payment = now + 120 s; the coupon math uses the real civil dates.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { address, type Address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { addressLink, txLink } from "../src/lib/explorer.js";
import { formatMinor } from "../src/lib/format.js";
import { expandHomePath, loadKeypairFromPath } from "../src/lib/keys.js";
import { createRpc, loadEnvFile } from "../src/lib/tx.js";
import { ProofWriter } from "./lib/proof.js";
import type { ProofStep } from "../src/lib/proof.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CLI = join(here, "../src/cli.ts");
const BOND_MINT_SCRIPT = join(here, "create-bond-mint.ts");
const REPORT = join(ROOT, "reports/demo-coupon.md");
function programIdFromConfig(): string {
  try {
    return (
      JSON.parse(readFileSync(join(ROOT, "config/devnet.json"), "utf8")) as {
        programId: string;
      }
    ).programId;
  } catch (e) {
    throw new Error(`config/devnet.json unreadable (${(e as Error).message})`, {
      cause: e,
    });
  }
}
const proof = new ProofWriter({
  kind: "coupon",
  reportsDir: join(ROOT, "reports"),
  programId: programIdFromConfig(),
});
const HOLDINGS = [10n, 25n, 65n];
const EXPECTED_GROSS = [50_000n, 125_000n, 325_000n]; // tiyn: 500.00 / 1,250.00 / 3,250.00 KZT

type Json = Record<string, unknown>;
interface Row {
  step: string;
  signatures: string[];
  slot?: string;
  status: string;
}

loadEnvFile();
const rows: Row[] = [];
const log = (...a: unknown[]): void => console.error("[demo-coupon]", ...a);
const keyPath = (env: string): string => {
  const p = process.env[env];
  if (!p) throw new Error(`${env} is not set (see .env.example)`);
  return expandHomePath(p);
};

/** All `signature` strings anywhere in a CLI JSON result (single tx or batches). */
function signaturesIn(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(signaturesIn);
  if (v !== null && typeof v === "object") {
    return Object.entries(v as Json).flatMap(([k, x]) =>
      k === "signature" && typeof x === "string" ? [x] : signaturesIn(x),
    );
  }
  return [];
}

/** Parse a JSON file, failing with the path in the message. */
function readJson<T>(path: string, label: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(`${label} (${path}) unreadable: ${(e as Error).message}`, {
      cause: e,
    });
  }
}

function exec(script: string, args: string[], env: NodeJS.ProcessEnv): Json {
  const stdout = execFileSync(
    process.execPath,
    ["--import", "tsx", script, ...args],
    {
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  const lines = stdout
    .trim()
    .split("\n")
    .filter((l) => l.startsWith("{"));
  if (lines.length === 0) return {};
  try {
    return JSON.parse(lines[lines.length - 1] ?? "{}") as Json;
  } catch (e) {
    throw new Error(`${script}: stdout was not JSON`, { cause: e });
  }
}

/** Run one CLI step, record it (optionally with explicit per-step expectations), and fail loudly with the step name. */
function step(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  script = CLI,
  expect?: ProofStep["expect"],
): Json {
  log(`→ ${name}`);
  try {
    const res = exec(script, args, env);
    rows.push({
      step: name,
      signatures: signaturesIn(res),
      slot: res.slot as string | undefined,
      status: "ok",
    });
    proof.record({
      label: name,
      signatures: signaturesIn(res),
      slot: res.slot as string | undefined,
      instruction: args[0] ?? "",
      expect,
    });
    return res;
  } catch (e) {
    rows.push({ step: name, signatures: [], status: "FAILED" });
    writeReport(
      `FAILED at step "${name}": ${(e as Error).message.split("\n")[0]}`,
    );
    throw new Error(`demo-coupon failed at step "${name}" (CLI logs above)`, {
      cause: e,
    });
  }
}

/** A step that must fail on-chain (holder registry demo). */
function expectFailure(
  name: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): void {
  log(`→ ${name} (expected to fail)`);
  try {
    exec(CLI, args, env);
  } catch {
    rows.push({ step: name, signatures: [], status: "rejected as expected ✓" });
    return;
  }
  throw new Error(
    `${name}: expected the program to refuse it, but it succeeded`,
  );
}

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

async function tkztBalance(
  rpc: ReturnType<typeof createRpc>,
  mint: Address,
  owner: Address,
): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
  });
  try {
    return BigInt((await rpc.getTokenAccountBalance(ata).send()).value.amount);
  } catch {
    return 0n;
  }
}

let summary: string[] = [];
let header: string[] = [];

function writeReport(status: string): void {
  const steps = rows.map((r) => {
    const links =
      r.signatures.length > 0
        ? r.signatures
            .map(
              (s, i) =>
                `[tx${r.signatures.length > 1 ? i + 1 : ""}](${txLink(s)})`,
            )
            .join(" ")
        : "—";
    return `| ${r.step} | ${links} | ${r.slot ?? ""} | ${r.status} |`;
  });
  const md = [
    "# Demo — coupon payment (scenario S1) on Solana devnet",
    "",
    ...header,
    `**Result:** ${status}`,
    "",
    "## Transactions",
    "",
    "| Step | Transaction | Slot | Status |",
    "|---|---|---|---|",
    ...steps,
    "",
    ...summary,
    "",
    "_Time compression: the record date is struck 90 s after the announcement and payment follows at +120 s; the coupon is computed from the real civil period 2026-07-03 → 2027-01-03 (30E/360 = 180 days). tKZT is a test Token-2022 mint (fiat KZT is SIMULATED); KYC is SIMULATED (registrar records a hash)._",
    "",
  ].join("\n");
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, md);
}

async function main(): Promise<void> {
  const rpc = createRpc();
  const base = readJson<{
    programId: string;
    tkztMint: string;
    series: Record<string, Json>;
  }>(join(ROOT, "config/devnet.json"), "config");
  const demo = readJson<{
    series: { QPNb1: { issueDate: string; maturityDate: string } };
  }>(join(ROOT, "config/demo.json"), "demo config");
  const name = `QPNb1-${Math.floor(Date.now() / 1000).toString(36)}`;
  const runCfg = join(ROOT, `logs/demo-coupon-${name}.json`);
  mkdirSync(dirname(runCfg), { recursive: true });
  writeFileSync(
    runCfg,
    JSON.stringify(
      {
        ...base,
        series: { ...base.series, [name]: { ...base.series.QPNb1, mint: "" } },
      },
      null,
      2,
    ),
  );
  const env = { ...process.env, QUPON_CONFIG: runCfg };
  const as = (role: string): string[] => ["--keypair", keyPath(role)];

  const investors = await Promise.all(
    [
      "QUPON_INVESTOR1_KEYPAIR",
      "QUPON_INVESTOR2_KEYPAIR",
      "QUPON_INVESTOR3_KEYPAIR",
    ].map(async (v) => ({
      env: v,
      address: (await loadKeypairFromPath(keyPath(v))).address,
    })),
  );
  const tkzt = address(base.tkztMint);
  header = [
    `- Series: **${name}** (ISIN-like id ${String(base.series.QPNb1?.isin ?? "")}), face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360`,
    `- Program: [${base.programId}](${addressLink(base.programId)}) · cash: tKZT [${base.tkztMint}](${addressLink(base.tkztMint)}) · cluster: devnet`,
    `- Run started: ${new Date().toISOString()}`,
    "",
  ];

  const mintRes = step(
    "S0 create Token-2022 bond mint (extensions validated on-chain)",
    ["--series", name],
    env,
    BOND_MINT_SCRIPT,
  );
  const mint = String(mintRes.mint ?? "");
  if (mint) header.splice(1, 0, `- Bond mint: [${mint}](${addressLink(mint)})`);
  step(
    "S0 series:init",
    [
      "series:init",
      "--series",
      name,
      "--issue-date",
      demo.series.QPNb1.issueDate,
      "--maturity-date",
      demo.series.QPNb1.maturityDate,
      ...as("QUPON_REGISTRAR_KEYPAIR"),
    ],
    env,
  );
  for (const [i, inv] of investors.entries()) {
    step(
      `S0 kyc:attest investor${i + 1} (SAS attestation, provider SIMULATED)`,
      [
        "kyc:attest",
        "--owner",
        inv.address,
        ...as("QUPON_KYC_PROVIDER_KEYPAIR"),
      ],
      env,
    );
    step(
      `S0 investor:register investor${i + 1} (checks the SAS attestation)`,
      [
        "investor:register",
        "--series",
        name,
        "--owner",
        inv.address,
        ...as("QUPON_REGISTRAR_KEYPAIR"),
      ],
      env,
    );
  }
  expectFailure(
    "S0 subscribe from an unregistered wallet",
    [
      "subscribe",
      "--series",
      name,
      "--units",
      "1",
      ...as("QUPON_OUTSIDER_KEYPAIR"),
    ],
    env,
  );
  for (const [i, inv] of investors.entries()) {
    step(
      `S0 subscribe ${HOLDINGS[i]} bonds — DvP investor${i + 1}`,
      [
        "subscribe",
        "--series",
        name,
        "--units",
        String(HOLDINGS[i]),
        ...as(inv.env),
      ],
      env,
      CLI,
      {
        event: "Subscribed",
        fields: { owner: inv.address, units: Number(HOLDINGS[i] ?? 0n) },
      },
    );
  }

  const before = await Promise.all(
    investors.map((inv) => tkztBalance(rpc, tkzt, inv.address)),
  );
  const announced = step(
    "S1 action:announce INTR #1 (record +90 s, payment +120 s)",
    [
      "action:announce",
      "--series",
      name,
      "--record-at",
      "+90",
      "--payment-at",
      "+120",
      "--corp-id",
      `Q${name.slice(-4)}-INTR-0001`,
      ...as("QUPON_REGISTRAR_KEYPAIR"),
    ],
    env,
  );
  log("waiting for the record date (90 s)…");
  await sleep(95_000);
  // The cluster clock can trail wall time by a few seconds: retry the strike briefly.
  for (let attempt = 1; ; attempt++) {
    try {
      const res = exec(
        CLI,
        ["action:strike", "--series", name, ...as("QUPON_REGISTRAR_KEYPAIR")],
        env,
      );
      rows.push({
        step: "S1 action:strike — record date, bond mint paused",
        signatures: signaturesIn(res),
        slot: res.slot as string | undefined,
        status: "ok",
      });
      proof.record({
        label: "S1 action:strike — record date, bond mint paused",
        signatures: signaturesIn(res),
        instruction: "action:strike",
      });
      break;
    } catch (e) {
      if (attempt >= 6)
        throw new Error("action:strike kept failing", { cause: e });
      log(
        `strike attempt ${attempt} failed (cluster clock behind?) — retrying in 10 s`,
      );
      await sleep(10_000);
    }
  }
  const snap = step(
    "S1 action:snapshot — entitlements per holder (sorted by owner)",
    ["action:snapshot", "--series", name, ...as("QUPON_REGISTRAR_KEYPAIR")],
    env,
  );
  proof.recordHolders({
    label: "S1 action:snapshot",
    instruction: "action:snapshot",
    signatures: signaturesIn(snap),
    holders: investors.map((inv, i) => ({
      name: `investor${i + 1}`,
      owner: inv.address,
      units: HOLDINGS[i] ?? 0n,
      gross: EXPECTED_GROSS[i] ?? 0n,
    })),
  });
  step(
    "S1 action:finalize-snapshot — Σ units == supply",
    [
      "action:finalize-snapshot",
      "--series",
      name,
      ...as("QUPON_REGISTRAR_KEYPAIR"),
    ],
    env,
  );
  step(
    "S1 action:fund — issuer pre-funds the escrow",
    ["action:fund", "--series", name, ...as("QUPON_ISSUER_KEYPAIR")],
    env,
  );
  const pay = step(
    "S1 action:pay — net to holders, tax to tax vault",
    ["action:pay", "--series", name, ...as("QUPON_REGISTRAR_KEYPAIR")],
    env,
  );
  proof.recordHolders({
    label: "S1 action:pay",
    instruction: "action:pay",
    signatures: signaturesIn(pay),
    holders: investors.map((inv, i) => ({
      name: `investor${i + 1}`,
      owner: inv.address,
      units: HOLDINGS[i] ?? 0n,
      gross: EXPECTED_GROSS[i] ?? 0n,
    })),
  });
  step(
    "S1 action:complete — reconcile, resume mint, next coupon date",
    ["action:complete", "--series", name, ...as("QUPON_REGISTRAR_KEYPAIR")],
    env,
  );
  const after = await Promise.all(
    investors.map((inv) => tkztBalance(rpc, tkzt, inv.address)),
  );

  const dump = exec(CLI, ["state:dump", "--series", name], env);
  const ents = findEntitlements(dump);
  const byOwner = new Map(ents.map((e) => [String(e.owner), e]));
  const table = investors.map((inv, i) => {
    const e = byOwner.get(inv.address);
    const gross = BigInt(String(e?.gross ?? "0"));
    const net = BigInt(String(e?.net ?? "0"));
    const paid = (after[i] ?? 0n) - (before[i] ?? 0n);
    if (gross !== EXPECTED_GROSS[i] || paid !== net) {
      throw new Error(
        `investor${i + 1}: gross ${gross} (expected ${EXPECTED_GROSS[i]}), paid ${paid} vs net ${net}`,
      );
    }
    return `| investor${i + 1} [${inv.address.slice(0, 8)}…](${addressLink(inv.address)}) | ${HOLDINGS[i]} | ${formatMinor(gross, 2, "tKZT")} | ${formatMinor(BigInt(String(e?.tax ?? "0")), 2, "tKZT")} | ${formatMinor(net, 2, "tKZT")} | ${formatMinor(before[i] ?? 0n, 2, "")} → ${formatMinor(after[i] ?? 0n, 2, "")} |`;
  });
  summary = [
    "## Entitlements (on-chain) and cash received",
    "",
    "| Holder | Bonds | Gross | Tax | Net paid | tKZT balance before → after |",
    "|---|---|---|---|---|---|",
    ...table,
    "",
    `Brief check: 10 bonds × 1,000 KZT × 10% ÷ 2 = **500.00** ✓ — 25 → 1,250.00 ✓ — 65 → 3,250.00 ✓ (total 5,000.00 = 100 × 50.00). Action: ${String(announced.action ?? "")}.`,
  ];
  writeReport("all steps succeeded ✓");
  log(
    `report written to ${REPORT} · proof manifest: ${proof.write().join(", ")}`,
  );
  console.log(
    JSON.stringify({
      ok: true,
      series: name,
      mint,
      report: REPORT,
      transactions: rows.flatMap((r) => r.signatures).length,
    }),
  );
}

/** Entitlement records from `state:dump` output, wherever the dump nests them. */
function findEntitlements(v: unknown): Json[] {
  if (Array.isArray(v)) return v.flatMap(findEntitlements);
  if (v !== null && typeof v === "object") {
    const o = v as Json;
    if ("owner" in o && "gross" in o && "net" in o && "units" in o) return [o];
    return Object.values(o).flatMap(findEntitlements);
  }
  return [];
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
