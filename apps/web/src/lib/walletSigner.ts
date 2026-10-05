"use client";

/**
 * Bridge: wallet-adapter (web3.js 1.x wallets) → Kit `TransactionSigner`.
 * Phantom/Backpack/Solflare sign the serialized transaction message bytes via
 * `signMessage`; the returned ed25519 signature is a valid transaction
 * signature over the same bytes. All instruction building stays in Kit
 * (generated client); wallet-adapter is only used for signing.
 */
import {
  type Address,
  type Instruction,
  type SignatureDictionary,
  type TransactionPartialSigner,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Signature,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { MessageSignerWalletAdapter } from "@solana/wallet-adapter-base";

/** RPC type produced by {@link portalRpc} (Kit, same endpoint as ConnectionProvider). */
export type PortalRpc = ReturnType<typeof createSolanaRpc>;

/** Devnet RPC for portal transactions; override with NEXT_PUBLIC_RPC_URL. */
export function portalRpc(): PortalRpc {
  return createSolanaRpc(
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
  );
}

/** A wallet adapter wrapped as a Kit `TransactionPartialSigner`. */
export function walletTransactionSigner(
  adapter: MessageSignerWalletAdapter,
  owner: Address,
): TransactionPartialSigner {
  return {
    address: owner,
    async signTransactions(transactions) {
      return Promise.all(
        transactions.map(async ({ messageBytes }) => {
          // SAFETY: the wallet signs the serialized transaction message bytes;
          // the raw 64-byte ed25519 signature is exactly Kit's SignatureBytes
          // over the same bytes, so the transaction is validly signed.
          const signature = await adapter.signMessage(
            messageBytes as unknown as Uint8Array,
          );
          return { [owner]: signature } as SignatureDictionary;
        }),
      );
    },
  };
}

/**
 * Build one transaction from `instructions`, sign it with the connected wallet
 * and wait for `confirmed` (poll, mirrors clients/ts lib/tx.ts — that file is
 * node-only). Returns the signature.
 */
export async function signAndSendWithWallet(
  adapter: MessageSignerWalletAdapter,
  owner: Address,
  rpc: PortalRpc,
  instructions: Instruction[],
): Promise<Signature> {
  const signer = walletTransactionSigner(adapter, owner);
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
  const transaction = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(transaction);
  await sendTransactionWithoutConfirmingFactory({ rpc })(transaction, {
    commitment: "confirmed",
  });
  const deadline = Date.now() + 60_000;
  for (;;) {
    const { value } = await rpc.getSignatureStatuses([signature]).send();
    const status = value[0];
    if (status?.err) {
      throw new Error(`transaction failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return signature;
    }
    if (Date.now() > deadline) {
      return signature; // sent fine, confirmation lagging — don't fail the UI
    }
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
}

/** One-line explanations for the program error names (programs/qupon_bonds/src/error.rs). */
const EXPLAIN: Record<string, string> = {
  Unauthorized: "this wallet is not the required authority for that step",
  InvestorNotActive: "your investor record is not active for this series",
  InvestorSuspended: "your investor record is suspended — bond account frozen",
  SeriesNotActive: "the series is closed or retiring",
  ActionAlreadyOpen: "another corporate action is still open",
  InvalidDates: "dates are not ordered or not valid",
  TooEarly: "too early for this step",
  WrongStatus: "the action is in the wrong status for this step",
  MintNotPaused: "the mint must be paused (record date) for this step",
  MintPaused: "the mint is paused (record date or retirement)",
  AccountMintMismatch: "token account belongs to a different mint",
  AccountOwnerMismatch: "token account belongs to a different owner",
  Underfunded: "the escrow does not hold enough funds yet",
  AlreadyProcessed: "already processed",
  NothingToDo: "nothing to do",
  MathOverflow: "arithmetic overflow",
  VotingClosed: "the voting window has ended",
  VotingOpen: "voting is still open",
  AlreadyVoted: "this wallet has already voted in this meeting",
  NoQuorum: "quorum not reached",
  NotApproved: "proposal not approved",
  SupplyNotZero: "mint supply is not zero",
  BatchTooLarge: "batch too large",
  EntitlementCalcMismatch: "entitlement figures do not match on-chain computation",
  UnsupportedDayCount: "day count convention not supported (ACT/ACT is reserved)",
  InvalidParams: "invalid parameter",
  PaymentsIncomplete: "not every snapshotted holder has been paid in full",
};

/** Pull the Anchor error name (or Solana custom error code) out of a Kit error. */
export function onchainErrorName(e: unknown): string | undefined {
  let text: string;
  if (e instanceof Error) {
    const cause = (e as { cause?: { logs?: string[]; message?: string } }).cause;
    text = `${e.message}\n${cause?.logs?.join("\n") ?? ""}\n${cause?.message ?? ""}`;
  } else {
    text = String(e);
  }
  return (
    /Error Code: ([A-Za-z0-9_]+)/.exec(text)?.[1] ??
    /custom program error: (0x[0-9a-f]+)/i.exec(text)?.[1]
  );
}

/** Human line for an error toast: on-chain error name + explanation if known. */
export function explainError(e: unknown): string {
  const name = onchainErrorName(e);
  if (name === "0x1") {
    return "insufficient funds — cash account balance too low for the DvP payment";
  }
  if (name) {
    return `${name}: ${EXPLAIN[name] ?? "on-chain program error"}`;
  }
  return e instanceof Error ? e.message : String(e);
}
