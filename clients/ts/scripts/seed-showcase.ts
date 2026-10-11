/**
 * `make seed-showcase` (task 91542; task 1540 runs it on devnet) — create the public board's four
 * curated demo series from config/showcase.json (the Go Showcase table) and drive each to the state
 * its dossier needs: coupon paid, redemption closed, meeting voting open with two votes, MCAL
 * announced. Idempotent (an active series on the same clock is skipped via series:list; closed or
 * other-clock series are re-seeded), writes the mints to
 * config/featured-series.txt, calls the registrar's POST /admin/showcase/seed when QUPON_API_URL +
 * ADMIN_TOKEN are set (prints the curl otherwise) and writes reports/showcase.md.
 * `--dry-run` prints the plan without touching the network.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { addressLink, txLink } from "../src/lib/explorer.js";
import { expandHomePath, loadKeypairFromPath } from "../src/lib/keys.js";
import { loadEnvFile } from "../src/lib/tx.js";
import {
  buildShowcasePlan,
  type PlanStep,
  type SeriesPlan,
  type ShowcaseDef,
} from "./lib/showcasePlan.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "../../..");
const CLI = join(here, "../src/cli.ts");
const DEFS = join(ROOT, "config/showcase.json");
const FEATURED = join(ROOT, "config/featured-series.txt");
const REPORT = join(ROOT, "reports/showcase.md");
const INVESTORS = [
  "QUPON_INVESTOR1_KEYPAIR",
  "QUPON_INVESTOR2_KEYPAIR",
  "QUPON_INVESTOR3_KEYPAIR",
];

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

const log = (...a: unknown[]): void => console.error("[seed-showcase]", ...a);
const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

function keyPath(v: string): string {
  const p = process.env[v];
  if (!p) throw new Error(`${v} is not set (see .env.example)`);
  return expandHomePath(p);
}

function exec(
  args: readonly string[],
  stderr: "inherit" | "pipe" = "inherit",
): Json {
  const stdout = execFileSync(
    process.execPath,
    ["--import", "tsx", CLI, ...args],
    {
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", stderr],
      maxBuffer: 64 << 20,
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
    throw new Error(`${args[0] ?? "qupon"}: stdout was not JSON`, { cause: e });
  }
}

function signaturesIn(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap(signaturesIn);
  if (v !== null && typeof v === "object")
    return Object.entries(v as Json).flatMap(([k, x]) =>
      k === "signature" && typeof x === "string" ? [x] : signaturesIn(x),
    );
  return [];
}

/** investor1..3 addresses; a missing keypair degrades to a placeholder so --dry-run needs no keys. */
async function owners(): Promise<readonly [string, string, string]> {
  const load = async (v: string, k: number): Promise<string> => {
    try {
      return (await loadKeypairFromPath(keyPath(v))).address;
    } catch {
      return `<investor${k + 1}>`;
    }
  };
  const o = await Promise.all(INVESTORS.map(load));
  return [o[0] ?? "", o[1] ?? "", o[2] ?? ""];
}

const today = (): string =>
  new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10); // Almaty date

async function waitFor(
  name: string,
  what: "record" | "payment",
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    const dump = exec(
      ["state:dump", "--series", name, "--no-entitlements"],
      "pipe",
    ) as {
      actions?: { data: Json }[];
    };
    const open = dump.actions?.[dump.actions.length - 1]?.data;
    const ts = Number(
      open?.[what === "record" ? "recordAt" : "paymentAt"] ?? 0,
    );
    if (ts > 0) {
      const ms = ts * 1000 - Date.now();
      if (ms > 0) {
        log(`waiting ${Math.ceil(ms / 1000)} s for the ${what} date`);
        await sleep(ms + 2000);
      }
      return;
    }
    if (attempt >= 5)
      throw new Error(`no open action on ${name} to wait for its ${what} date`);
    await sleep(3000); // the announce tx may still be confirming
  }
}

function dryRun(plan: readonly SeriesPlan[]): void {
  for (const s of plan) {
    log(
      `== ${s.def.ticker} (${s.def.isin}) — ${s.def.scenario}${s.skip ? "  [SKIP: already on chain]" : ""}`,
    );
    for (const st of s.steps)
      log(
        `   ${st.wait ? `wait for the ${st.wait} date` : (st.args ?? []).join(" ")}`,
      );
  }
  console.log(
    JSON.stringify({
      ok: true,
      dryRun: true,
      today: today(),
      series: plan.map((s) => ({
        ticker: s.def.ticker,
        isin: s.def.isin,
        name: s.name,
        skip: s.skip,
      })),
    }),
  );
}

async function runStep(
  s: SeriesPlan,
  st: PlanStep,
  section: Section,
): Promise<void> {
  if (st.wait !== undefined) {
    await waitFor(s.name, st.wait);
    section.rows.push({ step: st.label, signatures: [], status: "ok" });
    return;
  }
  if (st.args === undefined)
    throw new Error(`step without args or wait: ${st.label}`);
  log(`→ ${st.label}`);
  const res = exec(st.args);
  section.rows.push({
    step: st.label,
    signatures: signaturesIn(res),
    status: "ok",
  });
}

/** Feature exactly the showcase mints: rewrite config/featured-series.txt (drops stale ones). */
function featureMints(mints: readonly string[]): string[] {
  const kept = mints.filter((m) => m !== "");
  writeFileSync(FEATURED, `${kept.join("\n")}\n`);
  log(`config/featured-series.txt: ${kept.length} mint(s) written`);
  return kept;
}

/** POST /admin/showcase/seed, or print the curl for later (task's fallback path). */
async function seedEndpoint(): Promise<string> {
  const curl = `curl -fsS -X POST -H "Authorization: Bearer $ADMIN_TOKEN" "$QUPON_API_URL/admin/showcase/seed"`;
  const url = process.env.QUPON_API_URL;
  const token = process.env.ADMIN_TOKEN;
  if (url === undefined || url === "" || token === undefined || token === "") {
    log(`registrar showcase seed not called — run:\n  ${curl}`);
    return `not called — \`${curl}\``;
  }
  const res = await fetch(`${url.replace(/\/+$/, "")}/admin/showcase/seed`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`showcase seed endpoint ${res.status}: ${body}`);
  log(`showcase seed: ${body}`);
  return body;
}

function writeReport(
  sections: readonly Section[],
  seeded: string,
  mints: readonly string[],
  daySecs: number,
): void {
  const body = sections.flatMap((s) => [
    `## ${s.title}`,
    "",
    ...s.intro,
    ...(s.intro.length > 0 ? [""] : []),
    "| Step | Transaction | Status |",
    "|---|---|---|",
    ...s.rows.map(
      (r) =>
        `| ${r.step} | ${r.signatures.length > 0 ? r.signatures.map((x, i) => `[tx${r.signatures.length > 1 ? i + 1 : ""}](${txLink(x)})`).join(" ") : "—"} | ${r.status} |`,
    ),
    "",
  ]);
  const md = [
    "# Qupon — the curated public showcase on Solana devnet (`make seed-showcase`)",
    "",
    `Four demo series on the accelerated clock (1 civil day = ${daySecs} s), one per corporate-action scenario, issued from config/showcase.json — the single Go Showcase table (task 1535). Cluster devnet · run ${new Date().toISOString()}.`,
    "",
    `**Result:** ${seeded}`,
    "",
    `_Featured mints: ${mints.map((m) => `[${m}](${addressLink(m)})`).join(" · ")}_. KYC is SIMULATED (SAS attestations by the demo provider).`,
    "",
    ...body,
  ].join("\n");
  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(REPORT, md);
}

async function main(): Promise<void> {
  let defs: ShowcaseDef[];
  try {
    defs = JSON.parse(readFileSync(DEFS, "utf8")) as ShowcaseDef[];
  } catch (e) {
    throw new Error(
      `config/showcase.json (${DEFS}) unreadable — regenerate with EXPORT_SHOWCASE=1 go test ./internal/api -run TestShowcaseConfigMatchesTable`,
      { cause: e },
    );
  }
  const plan = buildShowcasePlan(defs, {
    today: today(),
    owners: await owners(),
  });
  if (process.argv.includes("--dry-run")) {
    dryRun(plan);
    return;
  }
  loadEnvFile();

  // Idempotency: only an active series on the definition's clock counts as already seeded —
  // closed or other-clock series (the old 4 s showcase) are re-planned (task 91555).
  const listed = exec(["series:list"]) as {
    series?: { mint: string; isin: string; status: string; daySecs: number }[];
  };
  const rows = new Map((listed.series ?? []).map((r) => [r.isin, r] as const));
  const mintOf = new Map([...rows].map(([isin, r]) => [isin, r.mint] as const));
  const live = buildShowcasePlan(defs, {
    today: today(),
    owners: await owners(),
    existing: rows,
    kp: keyPath,
  });

  const sections: Section[] = [];
  for (const s of live) {
    const section: Section = {
      title: `${s.def.ticker} (${s.def.isin}) — ${s.def.scenario}`,
      intro: [],
      rows: [],
    };
    sections.push(section);
    log(`== ${section.title}`);
    if (s.skip) {
      const mint = mintOf.get(s.def.isin) ?? "";
      section.intro.push(
        `- Already on chain (active, same clock): mint [${mint}](${addressLink(mint)}) — skipped.`,
      );
      section.rows.push({
        step: "series:list — active series on the same clock already on chain",
        signatures: [],
        status: "skipped",
      });
      continue;
    }
    for (const st of s.steps) await runStep(s, st, section);
  }
  // series:create printed each new mint; re-list to map ISIN → mint after the run.
  const after = exec(["series:list"]) as {
    series?: { mint: string; isin: string }[];
  };
  for (const r of after.series ?? []) mintOf.set(r.isin, r.mint);
  const mints = live.map((s) => mintOf.get(s.def.isin) ?? "");
  const missing = mints.filter((m) => m === "");
  if (missing.length > 0)
    throw new Error(`${missing.length} showcase series have no on-chain mint`);

  featureMints(mints);
  const seeded = await seedEndpoint();
  writeReport(sections, seeded, mints, live[0]?.def.daySecs ?? 0);
  log(`report written to ${REPORT}`);
  console.log(
    JSON.stringify({ ok: true, mints, report: REPORT, featured: true }),
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
