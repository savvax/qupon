import { inspect } from "node:util";
import {
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  type Instruction,
  getSignatureFromTransaction,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Signature,
  type TransactionSigner,
} from "@solana/kit";

/** The Rpc instance type produced by {@link createSolanaRpc}. */
export type QuponRpc = ReturnType<typeof createSolanaRpc>;

/** Load .env from the repo root if present (Node 22 stdlib; missing file is fine). */
export function loadEnvFile(): void {
  try {
    process.loadEnvFile(new URL("../../../../.env", import.meta.url).pathname);
  } catch {
    // no .env — defaults still work
  }
}

/** RPC endpoint from .env, falling back to the public devnet endpoint. */
export function getRpcUrl(): string {
  return process.env.RPC_URL ?? "https://api.devnet.solana.com";
}

export function createRpc(): QuponRpc {
  return createSolanaRpc(getRpcUrl());
}

/** Wait until a signature reaches at least `confirmed` (no websocket needed). */
export async function waitForConfirmation(rpc: QuponRpc, signature: Signature, timeoutMs = 60_000): Promise<Signature> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") return signature;
    if (Date.now() > deadline) throw new Error(`timeout waiting for confirmation of ${signature}`);
    await new Promise(resolve => setTimeout(resolve, 1_500));
  }
}

/**
 * Sign and send one transaction built from `ixs`, retrying once on an expired
 * blockhash, and wait for confirmation. Returns the signature.
 */
export async function sendInstructions(
  rpc: QuponRpc,
  payer: TransactionSigner,
  instructions: Instruction[],
  label: string,
): Promise<Signature> {
  const send = sendTransactionWithoutConfirmingFactory({ rpc });
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const { value: blockhash } = await rpc.getLatestBlockhash({ commitment: "confirmed" }).send();
      const message = pipe(
        createTransactionMessage({ version: 0 }),
        m => setTransactionMessageFeePayerSigner(payer, m),
        m => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
        m => appendTransactionMessageInstructions(instructions, m),
      );
      const transaction = await signTransactionMessageWithSigners(message);
      const signature = getSignatureFromTransaction(transaction);
      await send(transaction, { commitment: "confirmed" });
      return await waitForConfirmation(rpc, signature);
    } catch (e) {
      lastError = e;
      const retryable = String((e as Error).message).match(/blockhash|block height/i) !== null;
      const detail = (e as { cause?: { message?: string; logs?: string[] } })?.cause;
      if (detail?.logs?.length) console.error(`[${label}] simulation logs:\n  ${detail.logs.join("\n  ")}`);
      else if (detail?.message) console.error(`[${label}] cause: ${detail.message}`);
      console.error(`[${label}] full error:`, inspect(e, { depth: 5 }));
      if (!retryable || attempt === 2) break;
      console.error(`[${label}] blockhash expired, retrying…`);
    }
  }
  throw new Error(`[${label}] transaction failed: ${(lastError as Error).message}`, { cause: lastError });
}
