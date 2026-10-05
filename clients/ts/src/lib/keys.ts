import { readFileSync } from "node:fs";
import { createKeyPairFromBytes, createSignerFromKeyPair, type KeyPairSigner } from "@solana/kit";

/**
 * Load a solana-keygen JSON keypair (array of 64 numbers) as a Kit KeyPairSigner.
 * Keypairs live outside the repo (~/.config/qupon/*.json, see .env.example).
 */
export async function loadKeypairFromPath(path: string): Promise<KeyPairSigner> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch (e) {
    throw new Error(`cannot read keypair '${path}': ${(e as Error).message}`, { cause: e });
  }
  if (!Array.isArray(parsed) || parsed.length !== 64 || !parsed.every(n => typeof n === "number")) {
    throw new Error(`keypair '${path}' is not a solana-keygen JSON file (expected 64 numbers)`);
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
