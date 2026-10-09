/**
 * Transfer-hook client extras (plan 15 D1'): new series carry Token-2022 `TransferHook` = this
 * program, so *every* transfer of bond units crosses the hook gate. Token-2022 resolves the
 * extra metas our `init_hook` wrote to `["extra-account-metas", mint]` and invokes `execute`;
 * the client must append those accounts to the transfer instruction (read-only), always —
 * the gate itself decides on-chain whether the transfer may pass.
 */
import { AccountRole, type AccountMeta, type Address, type Instruction } from "@solana/kit";
import type { Mint } from "@solana-program/token-2022";
import {
	QUPON_BONDS_PROGRAM_ADDRESS,
	findCheckpointPda,
	findExtraAccountMetaListPda,
} from "../generated/index.js";
import { seriesPda } from "./pda.js";

const ro = (address: Address): AccountMeta => ({ address, role: AccountRole.READONLY });

/**
 * The accounts Token-2022 resolves from our ExtraAccountMetaList (matched by key): the series,
 * the source and destination owners' record-date checkpoints, the hook program and the list
 * itself — same order as the on-chain list written by `init_hook` (programs/qupon_bonds tests/hook.rs).
 */
export async function hookExtras(mint: Address, srcOwner: Address, dstOwner: Address): Promise<AccountMeta[]> {
	const series = await seriesPda(mint);
	return [
		ro(series),
		ro((await findCheckpointPda({ series, owner: srcOwner }))[0]),
		ro((await findCheckpointPda({ series, owner: dstOwner }))[0]),
		ro(QUPON_BONDS_PROGRAM_ADDRESS),
		ro((await findExtraAccountMetaListPda({ mint }))[0]),
	];
}

/** Append {@link hookExtras} to a bond transfer / DvP leg instruction (hooked series only — the caller checks). */
export async function withHookExtras<T extends Instruction>(ix: T, mint: Address, srcOwner: Address, dstOwner: Address): Promise<T> {
	return { ...ix, accounts: [...(ix.accounts ?? []), ...(await hookExtras(mint, srcOwner, dstOwner))] };
}

/** True when the mint's TransferHook is this program — every transfer then needs the extras above. */
export function mintIsHooked(mint: Mint): boolean {
	const exts = mint.extensions;
	return exts?.__option === "Some" && exts.value.some(e => e.__kind === "TransferHook" && e.programId === QUPON_BONDS_PROGRAM_ADDRESS);
}
