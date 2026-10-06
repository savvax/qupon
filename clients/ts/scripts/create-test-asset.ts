/**
 * Create a devnet test cash asset (task 603): a **classic SPL** mint like the
 * mainnet KZTE token, with mint authority = the registrar operator key, and
 * record it in config/devnet.json under `testAssets` (faucet allow-list) and
 * `cashAssets` (registry preset, seeded into the store on next start).
 * Idempotent: skips when the symbol already exists in `testAssets`.
 *
 * Usage: pnpm tsx scripts/create-test-asset.ts --symbol KZTE-dev --name "Evo tenge (devnet stand-in)" --decimals 2 --kind stablecoin
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  createSignerFromKeyPair,
  flattenInstructionPlan,
  writeKeyPair,
  type KeyPairSigner,
} from "@solana/kit";
import { getCreateMintInstructionPlan } from "@solana-program/token";
import { configPath, loadConfig, updateConfig, type TestAsset } from "../src/lib/config.js";
import { loadKeypair } from "../src/lib/keys.js";
import { createRpc, loadEnvFile, sendInstructions, type QuponRpc } from "../src/lib/tx.js";
import { TOKEN_PROGRAM_ADDRESS, fetchMint } from "@solana-program/token";
import { address } from "@solana/kit";

const KINDS = new Set(["test", "stablecoin", "wrapped_cbdc", "spl"]);

function log(...args: unknown[]): void {
  console.error(...args);
}

/** Kit 8 RPC methods need `.send()`; the token plan expects a promise client. */
function rentClient(rpc: QuponRpc): { getMinimumBalance: (space: number) => Promise<bigint> } {
  return {
    getMinimumBalance: async (space: number) =>
      BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(space)).send()),
  };
}

/** True when the mint address exists on-chain as a classic SPL mint (a previous run's config write can be interrupted). */
async function mintExistsOnChain(rpc: QuponRpc, mint: string): Promise<boolean> {
  try {
    const account = await fetchMint(rpc, address(mint));
    return account.exists && account.programAddress === TOKEN_PROGRAM_ADDRESS;
  } catch {
    return false;
  }
}

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i >= 0 ? process.argv[i + 1] : undefined;
  if (v === undefined || v === "") throw new Error(`pass --${name} <value>`);
  return v;
}

async function main(): Promise<void> {
  loadEnvFile();
  const symbol = arg("symbol");
  const name = arg("name");
  const decimals = Number(arg("decimals"));
  const kind = arg("kind");
  if (!/^[A-Za-z0-9-]{2,12}$/.test(symbol)) throw new Error(`symbol '${symbol}' must be 2-12 of A-Z a-z 0-9 -`);
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) throw new Error("decimals must be 0..9");
  if (!KINDS.has(kind)) throw new Error(`kind '${kind}' must be one of ${[...KINDS].join(", ")}`);

  const cfgPath = configPath();
  const cfg = loadConfig(cfgPath);
  const existing = cfg.testAssets ?? [];
  if (existing.some(t => t.symbol === symbol)) {
    const hit = existing.find(t => t.symbol === symbol)!;
    log(`testAssets already has ${symbol} (${hit.mint}) — nothing to do.`);
    console.log(JSON.stringify({ symbol, mint: hit.mint, created: false }));
    return;
  }

  // --- mint keypair: reuse ~/.config/qupon/test-mint-<symbol>.json when possible ---
  const mintKeypairPath = `${homedir()}/.config/qupon/test-mint-${symbol}.json`;
  let mintKeypair;
  if (existsSync(mintKeypairPath)) {
    let bytes: number[];
    try {
      bytes = JSON.parse(readFileSync(mintKeypairPath, "utf8")) as number[];
    } catch (e) {
      throw new Error(`cannot read mint keypair '${mintKeypairPath}': ${(e as Error).message}`, { cause: e });
    }
    mintKeypair = await createKeyPairFromBytes(new Uint8Array(bytes));
    log("reusing existing mint keypair", mintKeypairPath);
  } else {
    // generateKeyPair() makes non-extractable keys; build from random bytes so it can be persisted
    const privateKey = crypto.getRandomValues(new Uint8Array(32));
    mintKeypair = await createKeyPairFromPrivateKeyBytes(privateKey, true);
    await writeKeyPair(mintKeypair, mintKeypairPath);
  }
  const mintSigner: KeyPairSigner = await createSignerFromKeyPair(mintKeypair);
  const mint = mintSigner.address;

  const rpc = createRpc();
  const registrar = await loadKeypair("QUPON_REGISTRAR_KEYPAIR");

  // Classic SPL mint (like mainnet KZTE): mint authority = registrar operator, no freeze authority.
  let mintSig: string | undefined;
  if (await mintExistsOnChain(rpc, mint)) {
    log(`mint ${mint} already exists on-chain — recording config only`);
  } else {
    const plan = await getCreateMintInstructionPlan(rentClient(rpc), {
      payer: registrar,
      newMint: mintSigner,
      decimals,
      mintAuthority: registrar,
    });
    mintSig = await sendInstructions(rpc, registrar, flattenInstructionPlan(plan).map(n => n.instruction), `create ${symbol} mint`);
    log(`mint created: ${mint} (tx ${mintSig})`);
  }

  const entry: TestAsset = { symbol, mint, decimals, kind: kind as TestAsset["kind"] };
  updateConfig(cfgPath, { testAssets: [...existing, entry] });
  // Registry preset (GET /assets, wizard picker) — the Go service seeds `cashAssets` on start.
  updateConfig(cfgPath, {
    cashAssets: [
      ...(loadConfig(cfgPath).cashAssets ?? []).filter(a => a.mint !== mint),
      {
        symbol,
        name,
        mint,
        decimals,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
        kind,
        issuerNote: "Qupon devnet test mint; mint authority = Qupon operator.",
        mintAuthority: registrar.address,
        enabled: true,
      },
    ],
  });
  log(`testAssets + cashAssets written to ${cfgPath}`);
  console.log(JSON.stringify({ symbol, mint, created: true, mintTx: mintSig ?? null, decimals, kind }));
}

main().catch(e => {
  log(`create-test-asset failed: ${(e as Error).message}`);
  process.exit(1);
});
