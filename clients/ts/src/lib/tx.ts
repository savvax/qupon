import { inspect } from "node:util";
import {
  appendTransactionMessageInstructions,
  createDefaultRpcTransport,
  createSolanaRpc,
  createSolanaRpcFromTransport,
  createTransactionMessage,
  address,
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

/** Transient transport failures worth retrying: network errors, HTTP 429 and 5xx. */
export function isTransient(e: unknown): boolean {
  const text = `${(e as Error)?.message ?? ""} ${JSON.stringify((e as { context?: unknown })?.context ?? {})}`;
  return /fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|"statusCode":(429|5\d\d)|HTTP error \((429|5\d\d)\)/i.test(text);
}

/**
 * RPC client whose transport retries transient failures (≤ 4 retries, backoff). Safe for every call: reads are
 * idempotent and re-sending an already-signed transaction is a no-op on Solana (same signature).
 */
export function createRpc(): QuponRpc {
  const transport = createDefaultRpcTransport({ url: getRpcUrl() });
  const retrying = (async (config: Parameters<typeof transport>[0]) => {
    for (let attempt = 1; ; attempt++) {
      try {
        return await transport(config);
      } catch (e) {
        if (attempt > 4 || !isTransient(e)) throw e;
        console.error(`[rpc] transient error (${(e as Error).message}); retry ${attempt}/4`);
        await new Promise(r => setTimeout(r, 750 * 2 ** attempt));
      }
    }
  }) as typeof transport;
  return createSolanaRpcFromTransport(retrying);
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
/** ComputeBudget SetComputeUnitLimit: full snapshot/pay batches can exceed the 200k CU default. */
const COMPUTE_BUDGET = address("ComputeBudget111111111111111111111111111111");
export function computeUnitLimit(units: number): Instruction {
  const data = new Uint8Array(5);
  data[0] = 2; // SetComputeUnitLimit
  new DataView(data.buffer).setUint32(1, units, true);
  return { programAddress: COMPUTE_BUDGET, data };
}

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
        m => appendTransactionMessageInstructions([computeUnitLimit(600_000), ...instructions], m),
      );
      const transaction = await signTransactionMessageWithSigners(message);
      const signature = getSignatureFromTransaction(transaction);
      await send(transaction, { commitment: "confirmed" });
      return await waitForConfirmation(rpc, signature);
    } catch (e) {
      lastError = e;
      const retryable = String((e as Error).message).match(/blockhash|block height/i) !== null;
      const logs = logsOf(e);
      const detail = (e as { cause?: { message?: string } })?.cause;
      if (logs?.length) console.error(`[${label}] simulation logs:\n  ${logs.join("\n  ")}`);
      else if (detail?.message) console.error(`[${label}] cause: ${detail.message}`);
      console.error(`[${label}] full error:`, inspect(e, { depth: 5 }));
      if (!retryable || attempt === 2) break;
      console.error(`[${label}] blockhash expired, retrying…`);
    }
  }
  const anchor = anchorErrorFromLogs(logsOf(lastError));
  const reason = anchor === undefined ? "" : `${anchor} — `;
  throw new Error(`[${label}] transaction failed: ${reason}${(lastError as Error).message}`, { cause: lastError });
}

/** Program logs of a failed send: Kit's preflight error carries them in `context.logs` (older shapes in `cause`). */
function logsOf(e: unknown): string[] | undefined {
  const x = e as { context?: { logs?: string[] }; cause?: { logs?: string[]; context?: { logs?: string[] } } };
  return x?.context?.logs ?? x?.cause?.logs ?? x?.cause?.context?.logs;
}

/** "TooEarly (6006): <message>" from Anchor's program log, so the API and console show the on-chain error name. */
export function anchorErrorFromLogs(logs: readonly string[] | undefined): string | undefined {
  const m = logs?.join("\n").match(/Error Code: (\w+)\. Error Number: (\d+)\. Error Message: ([^\n]*?)\.?$/m);
  return m === null || m === undefined ? undefined : `${m[1]} (${m[2]}): ${m[3]}`;
}
