/**
 * `make demo-squads` — a 2-of-3 Squads v4 vault is the paying agent that funds a coupon on Solana devnet.
 * Writes reports/demo-squads.md.
 *
 * Squads multisig (registrar + issuer + paying agent, threshold 2) → fresh tKZT series whose paying_agent is the
 * vault PDA (`series:init --paying-agent`) → KYC/register/subscribe 10/25/65 → INTR announce/strike/snapshot/finalize
 * → issuer moves net+tax+principal to the vault's cash ATA → `fund_action` (funder = vault) proposed, approved by
 * registrar + issuer, executed through Squads → pay → complete. Every other step goes through the `qupon` CLI.
 *
 * DELIBERATE EXCEPTION to AGENTS.md ("no web3.js 1.x outside apps/web"): `@sqds/multisig` only speaks
 * `@solana/web3.js` v1, so this demo script (and only it) uses web3.js v1 — both are devDependencies of clients/ts.
 * The fund_action instruction itself is built with the Codama/Kit client and converted by src/lib/squads.ts.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { address, createNoopSigner, type Address } from "@solana/kit";
import {
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getTransferCheckedInstruction,
  TOKEN_2022_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { getTransferCheckedInstruction as getTransferCheckedInstructionSpl } from "@solana-program/token";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
} from "@solana/web3.js";
import * as multisig from "@sqds/multisig";
import { loadAction } from "../src/commands/action.js";
import {
  listEntitlements,
  loadSeries,
  sendQuiet,
  tokenProgramOfMint,
} from "../src/commands/common.js";
import { getFundActionInstruction } from "../src/generated/index.js";
import { loadConfig } from "../src/lib/config.js";
import { addressLink, txLink } from "../src/lib/explorer.js";
import { formatMinor } from "../src/lib/format.js";
import { expandHomePath, loadKeypairFromPath } from "../src/lib/keys.js";
import { requiredFunding, toLegacyInstruction } from "../src/lib/squads.js";
import { createRpc, getRpcUrl, loadEnvFile } from "../src/lib/tx.js";
import { ProofWriter } from "./lib/proof.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CLI = join(here, "../src/cli.ts");
const BOND_MINT_SCRIPT = join(here, "create-bond-mint.ts");
const REPORT = join(ROOT, "reports/demo-squads.md");
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
  kind: "squads",
  reportsDir: join(ROOT, "reports"),
  programId: programIdFromConfig(),
});
const REGISTRAR = "QUPON_REGISTRAR_KEYPAIR";
const ISSUER = "QUPON_ISSUER_KEYPAIR";
const PAYING_AGENT = "QUPON_PAYING_AGENT_KEYPAIR";
const KYC_PROVIDER = "QUPON_KYC_PROVIDER_KEYPAIR";
const INVESTORS = [
  "QUPON_INVESTOR1_KEYPAIR",
  "QUPON_INVESTOR2_KEYPAIR",
  "QUPON_INVESTOR3_KEYPAIR",
];
const UNITS = [10n, 25n, 65n];
const GROSS_PER_UNIT = 5_000n; // 1,000 KZT face × 10% / 2 = 50.00 KZT = 5,000 tiyn
const DECIMALS = 2; // tKZT
const STATUS_COMPLETED = 5;

type Json = Record<string, unknown>;
interface Row {
  step: string;
  signatures: string[];
  status: string;
}

loadEnvFile();
const rpc = createRpc();
const conn = new Connection(getRpcUrl(), "confirmed");
const rows: Row[] = [];
const intro: string[] = [];
const tables: string[] = [];
const log = (...a: unknown[]): void => console.error("[demo-squads]", ...a);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));
const keyPath = (env: string): string => {
  const p = process.env[env];
  if (!p) throw new Error(`${env} is not set (see .env.example)`);
  return expandHomePath(p);
};
const as = (env: string): string[] => ["--keypair", keyPath(env)];
const web3Keypair = (env: string): Keypair => {
  try {
    return Keypair.fromSecretKey(
      new Uint8Array(
        JSON.parse(readFileSync(keyPath(env), "utf8")) as number[],
      ),
    );
  } catch (e) {
    throw new Error(`${env} keypair unreadable (${(e as Error).message})`, {
      cause: e,
    });
  }
};
const fmt = (v: bigint): string => formatMinor(v, DECIMALS, "tKZT");
/** Parse a JSON file, failing with the path in the message. */
function readJsonFrom<T>(path: string, label: string): T {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (e) {
    throw new Error(`${label} (${path}) unreadable: ${(e as Error).message}`, {
      cause: e,
    });
  }
}

function signaturesIn(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(signaturesIn);
  if (v !== null && typeof v === "object") {
    return Object.entries(v as Json).flatMap(([k, x]) =>
      k === "signature" && typeof x === "string" ? [x] : signaturesIn(x),
    );
  }
  return [];
}

let env: NodeJS.ProcessEnv = process.env;

function exec(script: string, args: string[]): Json {
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

/** Run one recorded step: a CLI call (args) or an in-process function returning its signatures.
 * `instruction` names the Qupon instruction for in-process steps (e.g. Squads vault execution of fund_action). */
async function step(
  name: string,
  run: string[] | (() => Promise<string[]>),
  script = CLI,
  instruction?: string,
): Promise<Json> {
  log(`→ ${name}`);
  try {
    if (Array.isArray(run)) {
      const res = exec(script, run);
      rows.push({ step: name, signatures: signaturesIn(res), status: "ok" });
      proof.record({
        label: name,
        signatures: signaturesIn(res),
        instruction: run[0] ?? "",
      });
      return res;
    }
    const sigs = await run();
    rows.push({ step: name, signatures: sigs, status: "ok" });
    if (instruction !== undefined)
      proof.record({ label: name, signatures: sigs, instruction });
    return {};
  } catch (e) {
    rows.push({ step: name, signatures: [], status: "FAILED" });
    writeReport(`FAILED at "${name}"`);
    throw new Error(`demo-squads failed at step "${name}"`, { cause: e });
  }
}

/** Squads rpc.* helpers send without confirming — wait for `confirmed` and fail on an on-chain error. */
async function confirmed(sig: string): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const { value } = await conn.getSignatureStatus(sig);
    if (value?.err)
      throw new Error(`${sig} failed: ${JSON.stringify(value.err)}`);
    if (
      value?.confirmationStatus === "confirmed" ||
      value?.confirmationStatus === "finalized"
    )
      return sig;
    await sleep(1_000);
  }
  throw new Error(`${sig} not confirmed after 60 s`);
}

async function strikeWhenDue(series: string): Promise<void> {
  await sleep(50_000);
  for (let attempt = 1; ; attempt++) {
    try {
      const res = exec(CLI, [
        "action:strike",
        "--series",
        series,
        ...as(REGISTRAR),
      ]);
      rows.push({
        step: "action:strike — record date: register frozen (mint paused)",
        signatures: signaturesIn(res),
        status: "ok",
      });
      proof.record({
        label: "action:strike — record date: register frozen (mint paused)",
        signatures: signaturesIn(res),
        instruction: "action:strike",
      });
      return;
    } catch (e) {
      if (attempt >= 8)
        throw new Error("action:strike kept failing", { cause: e });
      log(`strike attempt ${attempt} too early — retrying in 8 s`);
      await sleep(8_000);
    }
  }
}

async function cashBalance(mint: Address, owner: Address): Promise<bigint> {
  const [ata] = await findAssociatedTokenPda({
    owner,
    mint,
    tokenProgram: await tokenProgramOfMint(rpc, mint),
  });
  const info = await rpc
    .getAccountInfo(ata, { encoding: "base64", commitment: "confirmed" })
    .send();
  if (info.value === null) return 0n;
  return BigInt(
    (await rpc.getTokenAccountBalance(ata, { commitment: "confirmed" }).send())
      .value.amount,
  );
}

function writeReport(result: string): void {
  const md = [
    "# Qupon — a 2-of-3 Squads vault funds a coupon as paying agent (`make demo-squads`)",
    "",
    `Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](${addressLink("QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd")}) · cluster devnet · run ${new Date().toISOString()}`,
    "",
    `**Result:** ${result}`,
    "",
    "## What it shows",
    "",
    "Institutional approval for funding a payout: the series' `paying_agent` is a Squads v4 vault PDA owned by a 2-of-3 multisig (registrar, issuer, paying agent). `fund_action` accepts `funder == series.paying_agent`, so the escrow can only be funded after two of the three members approve the proposal on Squads. Pay and complete stay with the registrar. A multisig *registrar* is still roadmap.",
    "",
    ...intro,
    "",
    "Squads devnet app: https://devnet.squads.so/ — the multisig may need to be imported there by its address to show the proposal and approvals.",
    "",
    "## Steps",
    "",
    "| Step | Transaction | Status |",
    "|---|---|---|",
    ...rows.map(
      (r) =>
        `| ${r.step} | ${r.signatures.length > 0 ? r.signatures.map((x, i) => `[tx${r.signatures.length > 1 ? i + 1 : ""}](${txLink(x)})`).join(" ") : "—"} | ${r.status} |`,
    ),
    "",
    ...tables,
  ].join("\n");
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, md);
}

async function main(): Promise<void> {
  const registrar = web3Keypair(REGISTRAR);
  const issuer = web3Keypair(ISSUER);
  const payingAgent = web3Keypair(PAYING_AGENT);

  // ---- a. Squads v4 multisig, threshold 2 ----
  const createKey = Keypair.generate();
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });
  const [vaultPda] = multisig.getVaultPda({ multisigPda, index: 0 });
  const vault = address(vaultPda.toBase58());
  await step(
    "Squads multisigCreateV2 — members registrar/issuer/paying agent, threshold 2",
    async () => {
      const [programConfigPda] = multisig.getProgramConfigPda({});
      const { treasury } =
        await multisig.accounts.ProgramConfig.fromAccountAddress(
          conn,
          programConfigPda,
        );
      const members = [registrar, issuer, payingAgent].map((k) => ({
        key: k.publicKey,
        permissions: multisig.types.Permissions.all(),
      }));
      return [
        await confirmed(
          await multisig.rpc.multisigCreateV2({
            connection: conn,
            treasury,
            createKey,
            creator: registrar,
            multisigPda,
            configAuthority: null,
            threshold: 2,
            members,
            timeLock: 0,
            rentCollector: null,
          }),
        ),
      ];
    },
  );
  intro.push(
    `- Multisig (2-of-3): [${multisigPda.toBase58()}](${addressLink(multisigPda.toBase58())})`,
    `- Vault (index 0) = series paying agent: [${vault}](${addressLink(vault)})`,
  );

  // ---- b. fresh tKZT series with the vault as paying agent ----
  const base = readJsonFrom<{ series: Record<string, Json> }>(
    join(ROOT, "config/devnet.json"),
    "config",
  );
  const demo = readJsonFrom<{
    series: { QPNb1: { issueDate: string; maturityDate: string } };
  }>(join(ROOT, "config/demo.json"), "demo config");
  const id = Math.floor(Date.now() / 1000).toString(36);
  const name = `QPNsq-${id}`;
  const runCfg = join(ROOT, `logs/demo-squads-${id}.json`);
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
  env = { ...process.env, QUPON_CONFIG: runCfg };
  intro.push(
    `- Series **${name}**: face 1,000 KZT, 10% semi-annual, 30E/360, ${demo.series.QPNb1.issueDate} → ${demo.series.QPNb1.maturityDate}, cash tKZT`,
  );

  await step(
    "create Token-2022 bond mint",
    ["--series", name],
    BOND_MINT_SCRIPT,
  );
  await step("series:init --paying-agent <Squads vault>", [
    "series:init",
    "--series",
    name,
    "--issue-date",
    demo.series.QPNb1.issueDate,
    "--maturity-date",
    demo.series.QPNb1.maturityDate,
    "--paying-agent",
    vault,
    ...as(REGISTRAR),
  ]);
  const investors = await Promise.all(
    INVESTORS.map(async (envVar, i) => ({
      envVar,
      label: `investor${i + 1}`,
      address: (await loadKeypairFromPath(keyPath(envVar))).address,
      units: UNITS[i] ?? 0n,
    })),
  );
  for (const inv of investors)
    await step(
      `kyc:attest ${inv.label} (SIMULATED KYC provider, SAS attestation)`,
      ["kyc:attest", "--owner", inv.address, ...as(KYC_PROVIDER)],
    );
  for (const inv of investors)
    await step(`investor:register ${inv.label}`, [
      "investor:register",
      "--series",
      name,
      "--owner",
      inv.address,
      ...as(REGISTRAR),
    ]);
  for (const inv of investors)
    await step(`subscribe ${inv.units} bonds — ${inv.label}`, [
      "subscribe",
      "--series",
      name,
      "--units",
      String(inv.units),
      ...as(inv.envVar),
    ]);

  // ---- c. INTR #1 up to a finalized snapshot ----
  const cfg = loadConfig(runCfg);
  const info = await loadSeries(rpc, cfg, name);
  if (info.account.payingAgent !== vault)
    throw new Error(
      `series paying_agent ${info.account.payingAgent} ≠ vault ${vault}`,
    );
  const cashMint = info.account.cashMint;
  const before = await Promise.all(
    investors.map((i) => cashBalance(cashMint, i.address)),
  );
  await step("action:announce INTR #1", [
    "action:announce",
    "--series",
    name,
    "--kind",
    "INTR",
    "--record-at",
    "+45",
    "--payment-at",
    "+60",
    "--corp-id",
    `S${id.slice(-4)}-INTR-0001`,
    ...as(REGISTRAR),
  ]);
  await strikeWhenDue(name);
  await step("action:snapshot", [
    "action:snapshot",
    "--series",
    name,
    ...as(REGISTRAR),
  ]);
  await step("action:finalize-snapshot", [
    "action:finalize-snapshot",
    "--series",
    name,
    ...as(REGISTRAR),
  ]);

  // ---- d. issuer → vault cash ATA, exactly the requirement ----
  const { action, account } = await loadAction(rpc, info, "0"); // `info` predates the announcement: name the first action
  const need = requiredFunding(account);
  const cashTokenProgram = await tokenProgramOfMint(rpc, cashMint);
  const issuerSigner = await loadKeypairFromPath(keyPath(ISSUER));
  const [issuerCash] = await findAssociatedTokenPda({
    owner: issuerSigner.address,
    mint: cashMint,
    tokenProgram: cashTokenProgram,
  });
  const [vaultCash] = await findAssociatedTokenPda({
    owner: vault,
    mint: cashMint,
    tokenProgram: cashTokenProgram,
  }); // PDA owner = off-curve, fine for an ATA
  const transfer =
    cashTokenProgram === TOKEN_2022_PROGRAM_ADDRESS
      ? getTransferCheckedInstruction
      : getTransferCheckedInstructionSpl;
  await step(
    `issuer → vault cash ATA: ${fmt(need)} (net + tax + principal from the action account)`,
    async () => [
      (
        await sendQuiet(
          rpc,
          issuerSigner,
          [
            getCreateAssociatedTokenIdempotentInstruction({
              payer: issuerSigner,
              ata: vaultCash,
              owner: vault,
              mint: cashMint,
              tokenProgram: cashTokenProgram,
            }),
            transfer(
              {
                source: issuerCash,
                mint: cashMint,
                destination: vaultCash,
                authority: issuerSigner,
                amount: need,
                decimals: DECIMALS,
              },
              { programAddress: cashTokenProgram },
            ),
          ],
          "vault top-up",
        )
      ).signature,
    ],
  );

  // ---- e. fund_action through Squads (2 of 3 approve) ----
  const fundIx = toLegacyInstruction(
    getFundActionInstruction({
      funder: createNoopSigner(vault),
      series: info.pda,
      action,
      cashMint,
      funderCash: vaultCash,
      escrow: account.escrow,
      cashTokenProgram,
      amount: need,
    }),
  );
  const ix = new TransactionInstruction({
    programId: new PublicKey(fundIx.programId),
    keys: fundIx.keys.map((k) => ({ ...k, pubkey: new PublicKey(k.pubkey) })),
    data: Buffer.from(fundIx.data),
  });
  const ms = await multisig.accounts.Multisig.fromAccountAddress(
    conn,
    multisigPda,
  );
  const transactionIndex = BigInt(ms.transactionIndex.toString()) + 1n;
  const common = { connection: conn, multisigPda, transactionIndex };
  await step(
    "Squads vaultTransactionCreate — fund_action(funder = vault) proposed by the registrar",
    async () => {
      const { blockhash } = await conn.getLatestBlockhash();
      const transactionMessage = new TransactionMessage({
        payerKey: vaultPda,
        recentBlockhash: blockhash,
        instructions: [ix],
      });
      return [
        await confirmed(
          await multisig.rpc.vaultTransactionCreate({
            ...common,
            feePayer: registrar,
            creator: registrar.publicKey,
            vaultIndex: 0,
            ephemeralSigners: 0,
            transactionMessage,
          }),
        ),
      ];
    },
  );
  await step("Squads proposalCreate", async () => [
    await confirmed(
      await multisig.rpc.proposalCreate({
        ...common,
        feePayer: registrar,
        creator: registrar,
      }),
    ),
  ]);
  await step("Squads proposalApprove — registrar (1/2)", async () => [
    await confirmed(
      await multisig.rpc.proposalApprove({
        ...common,
        feePayer: registrar,
        member: registrar,
      }),
    ),
  ]);
  await step(
    "Squads proposalApprove — issuer (2/2, threshold met)",
    async () => [
      await confirmed(
        await multisig.rpc.proposalApprove({
          ...common,
          feePayer: issuer,
          member: issuer,
        }),
      ),
    ],
  );
  await step(
    "Squads vaultTransactionExecute — vault signs fund_action, escrow funded",
    async () => [
      await confirmed(
        await multisig.rpc.vaultTransactionExecute({
          ...common,
          feePayer: registrar,
          member: registrar.publicKey,
        }),
      ),
    ],
    CLI,
    "action:fund",
  );

  // ---- f. pay + complete, assert payouts ----
  await step("action:pay — holders paid from escrow", [
    "action:pay",
    "--series",
    name,
    ...as(REGISTRAR),
  ]).then((pay) =>
    proof.recordHolders({
      label: "action:pay",
      instruction: "action:pay",
      signatures: signaturesIn(pay),
      holders: investors.map((inv) => ({
        name: inv.label,
        owner: inv.address,
        units: inv.units,
        gross: GROSS_PER_UNIT * inv.units,
      })),
    }),
  );
  await step("action:complete — reconcile, resume register", [
    "action:complete",
    "--series",
    name,
    ...as(REGISTRAR),
  ]);
  const after = await Promise.all(
    investors.map((i) => cashBalance(cashMint, i.address)),
  );
  const ents = new Map(
    (await listEntitlements(rpc, action)).map((e) => [e.owner as string, e]),
  );
  const lines = investors.map((inv, k) => {
    const e = ents.get(inv.address);
    if (e === undefined) throw new Error(`no entitlement for ${inv.label}`);
    const received = (after[k] ?? 0n) - (before[k] ?? 0n);
    if (e.gross !== GROSS_PER_UNIT * inv.units)
      throw new Error(
        `${inv.label}: gross ${e.gross} ≠ ${GROSS_PER_UNIT} × ${inv.units}`,
      );
    if (received !== e.net + e.principal)
      throw new Error(
        `${inv.label}: received ${received}, entitled ${e.net + e.principal}`,
      );
    return `| ${inv.label} | ${e.units} | ${fmt(e.gross)} | ${fmt(e.tax)} | ${fmt(e.net)} | ${fmt(received)} ✓ |`;
  });
  const { account: done } = await loadAction(rpc, info, String(account.index));
  if (done.status !== STATUS_COMPLETED)
    throw new Error(
      `action status ${done.status}, expected Completed (${STATUS_COMPLETED})`,
    );
  tables.push(
    `## Payouts — INTR #1, action [${action.slice(0, 8)}…](${addressLink(action)}) Completed ✓`,
    "",
    "| Holder | Units | Gross | Tax | Net | Received on-chain |",
    "|---|---|---|---|---|---|",
    ...lines,
    "",
  );

  writeReport(
    "coupon funded by the 2-of-3 Squads vault ✓ · 500.00 / 1,250.00 / 3,250.00 gross paid ✓ · action Completed ✓",
  );
  log(
    `report written to ${REPORT} · proof manifest: ${proof.write().join(", ")}`,
  );
  console.log(
    JSON.stringify({
      ok: true,
      series: name,
      multisig: multisigPda.toBase58(),
      vault,
      action,
      report: REPORT,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
