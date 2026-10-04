import { isAddress } from "@solana/kit";

const CLUSTER = "devnet";

/** Explorer link for a transaction signature (devnet). */
export function txLink(sig: string): string {
  return `https://explorer.solana.com/tx/${sig}?cluster=${CLUSTER}`;
}

/** Explorer link for an address/account (devnet). */
export function addressLink(addr: string): string {
  if (!isAddress(addr)) throw new Error(`invalid address: ${addr}`);
  return `https://explorer.solana.com/address/${addr}?cluster=${CLUSTER}`;
}
