/**
 * Create USDC (SPL Token, 6 decimals) associated token accounts for the demo
 * wallets and print Circle faucet instructions — the faucet itself cannot be
 * automated. Then reports current balances.
 *
 * Usage: pnpm tsx scripts/fund-usdc.ts
 */
import { address, type Address } from "@solana/kit";
import {
  TOKEN_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getCreateAssociatedTokenIdempotentInstruction,
} from "@solana-program/token";
import { configPath, loadConfig } from "../src/lib/config.js";
import { loadKeypair } from "../src/lib/keys.js";
import { createRpc, loadEnvFile, sendInstructions } from "../src/lib/tx.js";

const FAUCET_URL = "https://faucet.circle.com/";

function log(...args: unknown[]): void {
  console.error(...args);
}

async function main(): Promise<void> {
  loadEnvFile();
  const rpc = createRpc();
  const cfg = loadConfig(configPath());
  const registrar = await loadKeypair("QUPON_REGISTRAR_KEYPAIR");
  const usdc = address(cfg.usdcMint);

  const owners: { role: string; owner: Address }[] = [
    { role: "issuer", owner: address(cfg.wallets.issuer) },
    ...cfg.wallets.investors.map((owner, i) => ({ role: `investor${i + 1}`, owner: address(owner) })),
  ];

  const instructions = await Promise.all(
    owners.map(async ({ owner }) =>
      getCreateAssociatedTokenIdempotentInstruction({
        payer: registrar,
        ata: (await findAssociatedTokenPda({ mint: usdc, owner, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0],
        owner,
        mint: usdc,
        tokenProgram: TOKEN_PROGRAM_ADDRESS,
      }),
    ),
  );
  const sig = await sendInstructions(rpc, registrar, instructions, "create USDC ATAs");
  log(`USDC ATAs created (tx ${sig})`);

  const balances = await Promise.all(
    owners.map(async ({ role, owner }) => {
      const ata = (await findAssociatedTokenPda({ mint: usdc, owner, tokenProgram: TOKEN_PROGRAM_ADDRESS }))[0];
      let uiAmount = 0;
      try {
        const { value } = await rpc.getTokenAccountBalance(ata).send();
        uiAmount = Number(value.uiAmountString ?? "0");
      } catch {
        // not funded yet — expected right after creation
      }
      return { role, owner, ata, usdcUiAmount: uiAmount };
    }),
  );

  log("\nUSDC devnet faucet (cannot be automated):");
  for (const b of balances) {
    log(`  ${FAUCET_URL} — request devnet USDC for ${b.role}: ${b.owner} (20 USDC per address every 2 h)`);
  }
  console.log(JSON.stringify({ faucet: FAUCET_URL, tx: sig, accounts: balances }, null, 2));
}

main().catch(e => {
  log(`fund-usdc failed: ${(e as Error).message}`);
  process.exit(1);
});
