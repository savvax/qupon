/**
 * Create the tKZT devnet test mint (Token-2022, 2 decimals, on-chain metadata)
 * and fund the demo wallets. Idempotent: skips when config/devnet.json already
 * has a tkztMint that exists on-chain.
 *
 * Usage: pnpm tsx scripts/create-tkzt.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import {
  address,
  createKeyPairFromBytes,
  createKeyPairFromPrivateKeyBytes,
  createSignerFromKeyPair,
  flattenInstructionPlan,
  writeKeyPair,
  type KeyPairSigner,
} from "@solana/kit";
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  fetchMint,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
  getCreateMintInstructionPlan,
  getMintToInstruction,
} from "@solana-program/token-2022";
import { configPath, loadConfig, tkztMintSet, updateConfig } from "../src/lib/config.js";
import { loadKeypair } from "../src/lib/keys.js";
import { createRpc, loadEnvFile, sendInstructions, type QuponRpc } from "../src/lib/tx.js";

const DECIMALS = 2;
const ISSUER_TKZT = 100_000_000n; // UI units
const INVESTOR_TKZT = 1_000_000n; // UI units
const BASE_UNITS = 10n ** BigInt(DECIMALS);
const MINT_KEYPAIR_PATH = `${homedir()}/.config/qupon/tkzt-mint.json`;

function log(...args: unknown[]): void {
  console.error(...args);
}

/** Kit 8 RPC methods need `.send()`; the token-2022 plan expects a promise client. */
function rentClient(rpc: QuponRpc): { getMinimumBalance: (space: number) => Promise<bigint> } {
  return {
    getMinimumBalance: async (space: number) =>
      BigInt(await rpc.getMinimumBalanceForRentExemption(BigInt(space)).send()),
  };
}

/** True when the configured mint address exists and is owned by Token-2022. */
async function mintExistsOnChain(rpc: QuponRpc, mint: string): Promise<boolean> {
  try {
    const account = await fetchMint(rpc, address(mint));
    return account.exists && account.programAddress === TOKEN_2022_PROGRAM_ADDRESS;
  } catch {
    return false;
  }
}

async function main(): Promise<void> {
  loadEnvFile();
  const rpc = createRpc();
  const cfgPath = configPath();
  const cfg = loadConfig(cfgPath);
  const registrar = await loadKeypair("QUPON_REGISTRAR_KEYPAIR");

  // --- idempotence ---
  if (tkztMintSet(cfg)) {
    if (await mintExistsOnChain(rpc, cfg.tkztMint)) {
      log(`tkztMint ${cfg.tkztMint} already exists — nothing to do.`);
      console.log(JSON.stringify({ tkztMint: cfg.tkztMint, created: false }));
      return;
    }
    throw new Error(
      `config/devnet.json has tkztMint ${cfg.tkztMint} but it does not exist on devnet; ` +
        `remove the field to recreate`,
    );
  }

  // --- mint keypair: reuse ~/.config/qupon/tkzt-mint.json when possible ---
  let mintKeypair;
  if (existsSync(MINT_KEYPAIR_PATH)) {
    let bytes: number[];
    try {
      bytes = JSON.parse(readFileSync(MINT_KEYPAIR_PATH, "utf8")) as number[];
    } catch (e) {
      throw new Error(`cannot read mint keypair '${MINT_KEYPAIR_PATH}': ${(e as Error).message}`, { cause: e });
    }
    mintKeypair = await createKeyPairFromBytes(new Uint8Array(bytes));
    log("reusing existing mint keypair", MINT_KEYPAIR_PATH);
  } else {
    // generateKeyPair() makes non-extractable keys; build from random bytes so it can be persisted
    const privateKey = crypto.getRandomValues(new Uint8Array(32));
    mintKeypair = await createKeyPairFromPrivateKeyBytes(privateKey, true);
    await writeKeyPair(mintKeypair, MINT_KEYPAIR_PATH);
  }
  const mintSigner: KeyPairSigner = await createSignerFromKeyPair(mintKeypair);
  const mint = mintSigner.address;

  // --- tx 1: create mint + MetadataPointer + TokenMetadata ---
  const plan = await getCreateMintInstructionPlan(rentClient(rpc), {
    payer: registrar,
    newMint: mintSigner,
    decimals: DECIMALS,
    mintAuthority: registrar,
    extensions: [
      { __kind: "MetadataPointer", authority: registrar.address, metadataAddress: mint },
      {
        __kind: "TokenMetadata",
        updateAuthority: registrar.address,
        mint,
        name: "Test Tenge",
        symbol: "tKZT",
        uri: "",
        additionalMetadata: new Map<string, string>(),
      },
    ],
  });
  const mintInstructions = flattenInstructionPlan(plan).map(node => node.instruction);
  const mintSig = await sendInstructions(rpc, registrar, mintInstructions, "create tKZT mint");
  log(`mint created: ${mint} (tx ${mintSig})`);

  // --- tx 2: ATAs + initial supply ---
  const holders = [
    { role: "issuer", owner: address(cfg.wallets.issuer), amount: ISSUER_TKZT },
    ...cfg.wallets.investors.map((owner, i) => ({
      role: `investor${i + 1}`,
      owner: address(owner),
      amount: INVESTOR_TKZT,
    })),
  ];
  const fundInstructions = (
    await Promise.all(
      holders.map(async h => {
        const ata = (await findAssociatedTokenPda({ mint, owner: h.owner, tokenProgram: TOKEN_2022_PROGRAM_ADDRESS }))[0];
        return [
          getCreateAssociatedTokenIdempotentInstruction({
            payer: registrar,
            ata,
            owner: h.owner,
            mint,
            tokenProgram: TOKEN_2022_PROGRAM_ADDRESS,
          }),
          getMintToInstruction({
            mint,
            token: ata,
            mintAuthority: registrar,
            amount: h.amount * BASE_UNITS,
          }),
        ];
      }),
    )
  ).flat();
  const fundSig = await sendInstructions(rpc, registrar, fundInstructions, "fund tKZT");
  log(`funded ${holders.length} wallets (tx ${fundSig})`);

  updateConfig(cfgPath, c => {
    c.tkztMint = mint;
  });
  log(`tkztMint written to ${cfgPath}`);
  console.log(
    JSON.stringify({
      tkztMint: mint,
      created: true,
      mintTx: mintSig,
      fundTx: fundSig,
      mintAuthority: registrar.address,
      decimals: DECIMALS,
      issuerTkztBaseUnits: String(ISSUER_TKZT * BASE_UNITS),
      investorTkztBaseUnits: String(INVESTOR_TKZT * BASE_UNITS),
    }),
  );
}

main().catch(e => {
  log(`create-tkzt failed: ${(e as Error).message}`);
  process.exit(1);
});
