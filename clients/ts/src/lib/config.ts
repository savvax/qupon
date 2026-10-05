import { readFileSync, writeFileSync } from "node:fs";
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

export interface QuponConfig {
  cluster: string;
  programId: string;
  token2022ProgramId: string;
  usdcMint: string;
  /** Placeholder "REPLACE_…" means "not created yet". */
  tkztMint: string;
  series: Record<string, QuponSeriesConfig>;
  wallets: {
    registrar: string;
    issuer: string;
    payingAgent: string;
    investors: string[];
    outsider: string;
  };
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

/** Mutate one top-level key and write back with stable 2-space formatting. */
export function updateConfig(path: string, patch: Record<string, unknown>): void {
  let c: Record<string, unknown>;
  try {
    c = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`cannot read or parse config '${path}': ${(e as Error).message}`, { cause: e });
  }
  Object.assign(c, patch);
  writeFileSync(path, `${JSON.stringify(c, null, 2)}\n`);
}
