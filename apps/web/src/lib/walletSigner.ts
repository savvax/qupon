"use client";

/**
 * Bridge: wallet-adapter wallets → Kit signer. All instruction building stays in Kit (generated client); the
 * wallet only signs, through its standard `signTransaction` (wallets refuse `signMessage` over transaction bytes).
 * web3.js 1.x is used here only as the wire format the wallet adapter expects.
 */
import {
  type Address,
  type Instruction,
  type Transaction,
  type TransactionModifyingSigner,
  type TransactionWithinSizeLimit,
  type TransactionWithLifetime,
  appendTransactionMessageInstructions,
  createSolanaRpc,
  createTransactionMessage,
  getSignatureFromTransaction,
  getTransactionDecoder,
  getTransactionEncoder,
  pipe,
  sendTransactionWithoutConfirmingFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  type Signature,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import type { SignerWalletAdapter } from "@solana/wallet-adapter-base";
import { VersionedTransaction } from "@solana/web3.js";

/** RPC type produced by {@link portalRpc} (Kit, same endpoint as ConnectionProvider). */
export type PortalRpc = ReturnType<typeof createSolanaRpc>;

/**
 * Devnet RPC for portal transactions. NEXT_PUBLIC_* values are inlined into the browser bundle: use a keyless or
 * domain-restricted endpoint here, never the keyed RPC_URL from .env.
 */
export function portalRpc(): PortalRpc {
  return createSolanaRpc(
    process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com",
  );
}

/** The minimal wallet surface we need (lets tests use a fake wallet). */
export type TransactionSigningWallet = Pick<
  SignerWalletAdapter,
  "signTransaction"
>;

/**
 * A wallet as a Kit `TransactionModifyingSigner`: the Kit transaction is serialized, signed by the wallet with
 * `signTransaction`, and the wallet's signed bytes are decoded back — wallets may add instructions before signing,
 * so we send exactly what was signed.
 */
export function walletTransactionSigner(
  wallet: TransactionSigningWallet,
  owner: Address,
): TransactionModifyingSigner {
  return {
    address: owner,
    async modifyAndSignTransactions(transactions) {
      return Promise.all(
        transactions.map(async (tx) => {
          const unsigned = VersionedTransaction.deserialize(
            new Uint8Array(getTransactionEncoder().encode(tx)),
          );
          const signed = await wallet.signTransaction(unsigned);
          const out = getTransactionDecoder().decode(
            signed.serialize(),
          ) as Transaction;
          const sig = out.signatures[owner];
          if (!sig || sig.every((b) => b === 0)) {
            throw new Error("the wallet did not sign the transaction");
          }
          // Keep the lifetime Kit attached to the input (the wallet signs the same blockhash we gave it).
          return {
            ...out,
            ...("lifetimeConstraint" in tx
              ? { lifetimeConstraint: tx.lifetimeConstraint }
              : {}),
          } as Transaction &
            TransactionWithinSizeLimit &
            TransactionWithLifetime;
        }),
      );
    },
  };
}

/** v0 message with the wallet as fee payer (and signer of its instruction accounts). */
export function walletTransactionMessage(
  signer: TransactionModifyingSigner,
  blockhash: Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0],
  instructions: Instruction[],
) {
  return pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(signer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(blockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m),
  );
}

/**
 * Build one transaction from `instructions`, sign it with the connected wallet
 * and wait for `confirmed` (poll, mirrors clients/ts lib/tx.ts — that file is
 * node-only). Returns the signature.
 */
export async function signAndSendWithWallet(
  signer: TransactionModifyingSigner,
  rpc: PortalRpc,
  instructions: Instruction[],
): Promise<Signature> {
  const { value: blockhash } = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const transaction = await signTransactionMessageWithSigners(
    walletTransactionMessage(signer, blockhash, instructions),
  );
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
  EntitlementCalcMismatch:
    "entitlement figures do not match on-chain computation",
  UnsupportedDayCount:
    "day count convention not supported (ACT/ACT is reserved)",
  InvalidParams: "invalid parameter",
  PaymentsIncomplete: "not every snapshotted holder has been paid in full",
  KycAttestationInvalid:
    "no live KYC attestation (Solana Attestation Service) for this wallet",
};

/** Pull the Anchor error name (or Solana custom error code) out of a Kit error. */
export function onchainErrorName(e: unknown): string | undefined {
  let text: string;
  if (e instanceof Error) {
    const cause = (e as { cause?: { logs?: string[]; message?: string } })
      .cause;
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
