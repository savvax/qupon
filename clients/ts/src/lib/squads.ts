import { isSignerRole, isWritableRole, type Instruction } from "@solana/kit";

/** web3.js-v1-shaped instruction with base58 strings — the demo-squads script wraps them in PublicKey (keeps web3.js out of src/). */
export interface LegacyInstruction {
  programId: string;
  keys: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  data: Uint8Array;
}

/** Map a Kit instruction's account roles onto web3.js v1 `isSigner`/`isWritable` flags. */
export function toLegacyInstruction(ix: Instruction): LegacyInstruction {
  return {
    programId: ix.programAddress,
    keys: (ix.accounts ?? []).map(a => ({ pubkey: a.address, isSigner: isSignerRole(a.role), isWritable: isWritableRole(a.role) })),
    data: new Uint8Array(ix.data ?? []),
  };
}

/** Escrow requirement of a cash action (fund_action needs net + tax + principal). */
export function requiredFunding(a: { totalNet: bigint; totalTax: bigint; totalPrincipal: bigint }): bigint {
  return a.totalNet + a.totalTax + a.totalPrincipal;
}
