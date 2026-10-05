import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { createKeyPairFromBytes, createSignerFromKeyPair, type KeyPairSigner } from "@solana/kit";

/**
 * Load a solana-keygen JSON keypair (array of 64 numbers) as a Kit KeyPairSigner.
 * Keypairs live outside the repo (~/.config/qupon/*.json, see .env.example).
 */
/** Expand a leading $HOME or ~ (process.loadEnvFile does not expand variables). */
export function expandHomePath(path: string): string {
  if (path === "$HOME" || path.startsWith("$HOME/")) return homedir() + path.slice(5);
  if (path === "~" || path.startsWith("~/")) return homedir() + path.slice(1);
  return path;
}

export async function loadKeypairFromPath(path: string): Promise<KeyPairSigner> {
  const expanded = expandHomePath(path);
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(expanded, "utf8"));
  } catch (e) {
    throw new Error(`cannot read keypair '${expanded}': ${(e as Error).message}`, { cause: e });
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every(n => typeof n === "number")) {
    throw new Error(`keypair '${expanded}' is not a solana-keygen JSON file (expected 64 numbers)`);
  }
  const bytes = new Uint8Array(parsed as number[]);
  return createSignerFromKeyPair(await createKeyPairFromBytes(bytes));
}

/** Load the keypair whose path is in `envVar` (e.g. QUPON_REGISTRAR_KEYPAIR). */
export async function loadKeypair(envVar: string): Promise<KeyPairSigner> {
  const path = process.env[envVar];
  if (!path) throw new Error(`${envVar} is not set (copy .env.example to .env)`);
  return loadKeypairFromPath(path);
}
