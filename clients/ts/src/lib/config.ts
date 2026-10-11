import { closeSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { isAddress } from "@solana/kit";

/** Shape of `config/devnet.json` — public keys only, never secrets. */
export interface QuponSeriesConfig {
  mint: string;
  cashMint: string;
  isin: string;
  faceValue: number;
  couponRateBps: number;
  frequency: number;
  dayCount: string;
  termYears: number;
}

/** Devnet faucet asset (task 603): mints `asset:faucet` and POST /me/faucet may hand out. */
export interface TestAsset {
  symbol: string;
  mint: string;
  decimals: number;
  kind: "test" | "stablecoin" | "wrapped_cbdc" | "spl";
}

/** cashAssets preset of config/devnet.json — seeded into the registrar store on start (task 600). */
export interface CashAssetPreset {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  tokenProgram: string;
  kind: TestAsset["kind"];
  issuerNote: string;
  mintAuthority?: string;
  freezeAuthority?: string;
  enabled: boolean;
}

export interface QuponConfig {
  cluster: string;
  programId: string;
  token2022ProgramId: string;
  usdcMint: string;
  /** Placeholder "REPLACE_…" means "not created yet". */
  tkztMint: string;
  /** Devnet-only: mints the test faucet may hand out (scripts/create-test-asset.ts writes this). */
  testAssets?: TestAsset[];
  cashAssets?: CashAssetPreset[];
  series: Record<string, QuponSeriesConfig>;
  wallets: {
    registrar: string;
    issuer: string;
    payingAgent: string;
    investors: string[];
    outsider: string;
  };
}

/** Scenario parameters for the devnet demos — drives demo scripts and the UI seed. */
export interface DemoPeriod {
  start: string;
  end: string;
  days: number;
}
export interface DemoInvestor {
  index: number;
  units: number;
  type: "individual" | "legal_entity";
  resident: boolean;
  taxBps: number;
}
export interface DemoSeries {
  cashMint: "tKZT" | "USDC";
  faceValue: number;
  couponRateBps: number;
  frequency: number;
  dayCount: "THIRTY_360" | "ACT_365";
  issueDate: string;
  maturityDate: string;
  couponPeriods: DemoPeriod[];
  pricePerUnit: number;
  mcal?: {
    callDate: string;
    accrualStart: string;
    accruedDays: number;
    perUnitPrincipal: number;
  };
  investors: DemoInvestor[];
}
export interface DemoConfig {
  series: Record<"QPNb1" | "BTRKdemo", DemoSeries>;
  offsets: { recordAtOffsetSec: number; paymentAtOffsetSec: number; votingWindowSec: number };
  votePlan: {
    proposal: { newRateBps: number };
    quorumBps: number;
    approvalBps: number;
    votes: { units: number; choice: "for" | "against" | "abstain" }[];
  };
}

/** Default path: <repo>/config/demo.json (QUPON_DEMO_CONFIG overrides). */
export function demoConfigPath(): string {
  return (
    process.env.QUPON_DEMO_CONFIG ??
    new URL("../../../../config/demo.json", import.meta.url).pathname
  );
}

export function loadDemoConfig(path = demoConfigPath()): DemoConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read demo config '${path}': ${(e as Error).message}`, { cause: e });
  }
  try {
    return JSON.parse(raw) as DemoConfig;
  } catch (e) {
    throw new Error(`${path}: invalid JSON (${(e as Error).message})`, { cause: e });
  }
}

/** Default path: <repo>/config/devnet.json (QUPON_CONFIG overrides). */
export function configPath(): string {
  return (
    process.env.QUPON_CONFIG ??
    new URL("../../../../config/devnet.json", import.meta.url).pathname
  );
}

const PLACEHOLDER = "REPLACE_";

function assertAddress(value: string, field: string): void {
  if (!isAddress(value)) {
    throw new Error(`config field '${field}' is not a valid address: '${value}'`);
  }
}

export function parseConfig(raw: string, source = "config"): QuponConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`${source}: invalid JSON (${(e as Error).message})`, { cause: e });
  }
  const c = parsed as Partial<QuponConfig>;
  if (c.wallets === undefined) throw new Error(`${source}: missing 'wallets'`);
  if (c.programId === undefined) throw new Error(`${source}: missing 'programId'`);
  for (const [field, v] of Object.entries(c.wallets)) {
    if (Array.isArray(v)) v.forEach((a, i) => assertAddress(a, `wallets.${field}[${i}]`));
    else assertAddress(v as string, `wallets.${field}`);
  }
  assertAddress(c.programId, "programId");
  if (c.tkztMint !== undefined && c.tkztMint !== "" && !c.tkztMint.startsWith(PLACEHOLDER)) {
    assertAddress(c.tkztMint, "tkztMint");
  }
  return c as QuponConfig;
}

export function loadConfig(path = configPath()): QuponConfig {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (e) {
    throw new Error(`cannot read config '${path}': ${(e as Error).message}`, { cause: e });
  }
  return parseConfig(raw, path);
}

/** True when the tKZT mint has actually been created (not a placeholder/empty). */
export function tkztMintSet(c: QuponConfig): boolean {
  return c.tkztMint !== "" && !c.tkztMint.startsWith(PLACEHOLDER);
}

const LOCK_RETRY_MS = 75;
const LOCK_TIMEOUT_MS = 30_000;
const LOCK_STALE_MS = 60_000;

/** Synchronous sleep — `updateConfig` stays sync for its CLI callers. */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Mutate the config under an exclusive `<path>.lock` and write it back atomically
 * (tmp file + rename), so concurrent CLI runs never lose each other's entries
 * (task 91560: two parallel `series:create` runs dropped one side's series).
 * `mutate` receives the FRESH parsed object — mutate only your own nested entry
 * (`c.series[name] = { ...(c.series[name] ?? {}), ...fields }`), never spread a
 * config read at command start. A lock older than 60 s (crashed writer) is broken.
 */
export function updateConfig(path: string, mutate: (c: Record<string, unknown>) => void): void {
  const lock = `${path}.lock`;
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  for (;;) {
    try {
      closeSync(openSync(lock, "wx"));
      writeFileSync(lock, `${process.pid}\n`);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
          rmSync(lock, { force: true });
          continue; // stale lock broken — race for it again
        }
      } catch {
        // lock vanished between open and stat — try to create it
      }
      if (Date.now() > deadline) {
        throw new Error(`cannot acquire config lock '${lock}' after ${LOCK_TIMEOUT_MS / 1000}s`, { cause: e });
      }
      sleepSync(LOCK_RETRY_MS);
    }
  }
  try {
    let c: Record<string, unknown>;
    try {
      c = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch (e) {
      throw new Error(`cannot read or parse config '${path}': ${(e as Error).message}`, { cause: e });
    }
    mutate(c);
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(c, null, 2)}\n`);
    renameSync(tmp, path);
  } finally {
    rmSync(lock, { force: true });
  }
}
