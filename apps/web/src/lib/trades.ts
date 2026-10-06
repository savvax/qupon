/**
 * Secondary trades (plan 13, docs/03-domain.md §4a): the registrar API's trade DTOs and reads, and the investor's
 * wallet-mode funding transfer. Qupon never calls the DvP program from the browser: funding a leg is one plain
 * `TransferChecked` to the trade's escrow, built only after the on-chain record matched what the investor was shown.
 */
import {
  TOKEN_2022_PROGRAM_ADDRESS,
  findAssociatedTokenPda,
  getTransferCheckedInstruction,
} from "@solana-program/token-2022";
import {
  type Address,
  type ReadonlyUint8Array,
  type TransactionSigner,
  address,
  getAddressDecoder,
  getBase64Encoder,
  getU64Decoder,
} from "@solana/kit";
import { type Amount, apiGet } from "./api";
import { BoError } from "./boClient";
import type { PortalRpc } from "./walletSigner";

/** Solana Foundation DvP program (devnet and mainnet) — the owner of every trade record. */
export const DVP_PROGRAM = "dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq";
/** Size of a `SwapDvp` account (DvP program v0.1.0). */
export const SWAP_DVP_SIZE = 458;
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export type TradeStatus = "awaiting_funding" | "ready" | "closed";
export type TradeSide = "seller" | "buyer";

export type TradeDTO = {
  swapDvp: string;
  escrow: string;
  seller: string;
  buyer: string;
  units: string;
  cashAmount: Amount;
  admittedAt: string;
  fundedUnits: string | null;
  fundedCash: Amount | null;
  status: TradeStatus;
};
export type TradesDTO = { openTrades: number; items: TradeDTO[] };

/** Trades of a series, oldest first (public read). */
export const listTrades = (mint: string) =>
  apiGet<TradesDTO>(`/series/${mint}/trades`);

/** Whether a leg's escrow already holds what the trade needs. */
export function legFunded(t: TradeDTO, side: TradeSide): boolean {
  return side === "seller"
    ? t.fundedUnits != null && BigInt(t.fundedUnits) >= BigInt(t.units)
    : t.fundedCash != null &&
        BigInt(t.fundedCash.minor) >= BigInt(t.cashAmount.minor);
}

/**
 * Run a trade write; the API's trade error codes come back as the localized sentence from `trades.errors.*`
 * (`t` is the `trades` translator) instead of the raw English message.
 */
export async function withTradeErrors<T>(
  call: () => Promise<T>,
  t: ((key: string, values?: Record<string, string>) => string) & {
    has: (key: string) => boolean;
  },
): Promise<T> {
  try {
    return await call();
  } catch (e) {
    if (e instanceof BoError && t.has(`errors.${e.code}`))
      throw new BoError(
        e.status,
        e.code,
        t(`errors.${e.code}`, { message: e.message }),
        e.onchainError,
      );
    throw e;
  }
}

/** The terms the investor saw on screen before pressing the funding button. */
export type ShownTrade = {
  swapDvp: string;
  seller: string;
  buyer: string;
  bondMint: string;
  cashMint: string;
  units: bigint;
  cash: bigint;
};

/**
 * Refuse to fund unless the on-chain `SwapDvp` record is the trade that was shown: owned by the DvP program,
 * 458 bytes, same parties, mints and amounts, and `wallet` is the party of `side`. Throws with the reason.
 */
export function checkSwapDvp(
  account: { owner: string; data: ReadonlyUint8Array },
  shown: ShownTrade,
  side: TradeSide,
  wallet: string,
): void {
  if (account.owner !== DVP_PROGRAM)
    throw new Error("trade record is not owned by the Solana DvP program");
  if (account.data.length !== SWAP_DVP_SIZE)
    throw new Error("trade record has an unexpected size");
  const key = (offset: number) =>
    getAddressDecoder().decode(account.data, offset) as string;
  const u64 = (offset: number) => getU64Decoder().decode(account.data, offset);
  const diff = (
    [
      ["seller", key(1), shown.seller],
      ["buyer", key(33), shown.buyer],
      ["bond mint", key(65), shown.bondMint],
      ["cash mint", key(97), shown.cashMint],
      ["bond amount", u64(225), shown.units],
      ["cash amount", u64(233), shown.cash],
    ] as const
  ).find(([, onchain, expected]) => onchain !== expected);
  if (diff)
    throw new Error(
      `trade record differs from the trade shown (${diff[0]}) — nothing was sent`,
    );
  if (wallet !== (side === "seller" ? shown.seller : shown.buyer))
    throw new Error(`the connected wallet is not the ${side} of this trade`);
}

/** A leg's escrow: the associated token account of the `SwapDvp` record — derived here, never taken from the API. */
export async function tradeEscrow(
  swapDvp: Address,
  mint: Address,
  tokenProgram: Address,
): Promise<Address> {
  return (
    await findAssociatedTokenPda({ owner: swapDvp, tokenProgram, mint })
  )[0];
}

/**
 * Build the funding transfer of one leg (seller → bonds, buyer → cash) from the wallet's associated token account
 * to the trade's escrow, after re-reading the record and checking it against `shown`.
 */
export async function buildFundTradeIx(
  rpc: PortalRpc,
  shown: ShownTrade,
  side: TradeSide,
  owner: TransactionSigner,
) {
  const read = async (a: Address) =>
    (
      await rpc
        .getAccountInfo(a, { commitment: "confirmed", encoding: "base64" })
        .send()
    ).value;
  const swapDvp = address(shown.swapDvp);
  const record = await read(swapDvp);
  if (record === null)
    throw new Error(
      "trade record not found on chain — it was settled or cancelled",
    );
  checkSwapDvp(
    {
      owner: record.owner,
      data: getBase64Encoder().encode(record.data[0]),
    },
    shown,
    side,
    owner.address,
  );
  const mint = address(side === "seller" ? shown.bondMint : shown.cashMint);
  const mintAccount = await read(mint);
  if (
    mintAccount === null ||
    (mintAccount.owner !== TOKEN_2022_PROGRAM_ADDRESS &&
      mintAccount.owner !== TOKEN_PROGRAM)
  )
    throw new Error(`mint ${mint} is not a token mint`);
  const tokenProgram = mintAccount.owner;
  // Mint layout (both token programs): authority option 36 bytes, supply u64, then decimals.
  const decimals = getBase64Encoder().encode(mintAccount.data[0])[44];
  if (decimals === undefined) throw new Error(`mint ${mint} is not a mint`);
  const [source] = await findAssociatedTokenPda({
    owner: owner.address,
    tokenProgram,
    mint,
  });
  return getTransferCheckedInstruction(
    {
      source,
      mint,
      destination: await tradeEscrow(swapDvp, mint, tokenProgram),
      authority: owner,
      amount: side === "seller" ? shown.units : shown.cash,
      decimals,
    },
    { programAddress: tokenProgram },
  );
}
