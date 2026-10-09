import { describe, expect, it } from "vitest";
import {
  AccountRole,
  address,
  createNoopSigner,
  getAddressEncoder,
  type Address,
  getProgramDerivedAddress,
} from "@solana/kit";
import {
  getMintCodec,
  getInitializeTransferHookInstruction,
} from "@solana-program/token-2022";
import {
  QUPON_BONDS_PROGRAM_ADDRESS,
  getInitHookInstructionAsync,
  getSnapshotBatchInstruction,
} from "../generated/index.js";
import { hookExtras, mintIsHooked, withHookExtras } from "./hook.js";
import { seriesPda } from "./pda.js";

// Any valid addresses — PDA math does not care which (same keys as bondMint.test.ts).
const MINT = address("7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau");
const SERIES = address("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
const SRC = address("6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cve7BxX5M9rdC");
const DST = address("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo");

const seed = (s: string, ...keys: Address[]) =>
  getProgramDerivedAddress({
    programAddress: QUPON_BONDS_PROGRAM_ADDRESS,
    seeds: [
      new TextEncoder().encode(s),
      ...keys.map((k) => getAddressEncoder().encode(k)),
    ],
  });

describe("hook extras (plan 15 D1')", () => {
  it("derives the five read-only metas in the on-chain list order", async () => {
    const series = await seriesPda(MINT);
    expect(series).toBe((await seed("series", MINT))[0]);
    const metas = await hookExtras(MINT, SRC, DST);
    expect(metas.map((m) => m.address)).toEqual([
      series,
      (await seed("ckpt", series, SRC))[0],
      (await seed("ckpt", series, DST))[0],
      QUPON_BONDS_PROGRAM_ADDRESS,
      (await seed("extra-account-metas", MINT))[0],
    ]);
    expect(metas.every((m) => m.role === AccountRole.READONLY)).toBe(true);
    // source and destination checkpoints differ, and neither is the extra-metas PDA
    expect(metas[1]?.address).not.toBe(metas[2]?.address);
  });

  it("appends the extras to a transfer / batch instruction without touching its own accounts", async () => {
    const base = getSnapshotBatchInstruction({
      authority: createNoopSigner(SERIES),
      series: SERIES,
      action: DST,
      mint: MINT,
    });
    const n = base.accounts.length;
    const ix = await withHookExtras(base, MINT, SRC, DST);
    expect(ix.accounts.slice(0, n)).toEqual(base.accounts);
    expect(ix.accounts.length).toBe(n + 5);
  });
});

const hookedMintArgs = {
  mintAuthority: SERIES,
  supply: 100n,
  decimals: 0,
  isInitialized: true,
  freezeAuthority: SERIES,
  extensions: [
    {
      __kind: "TransferHook" as const,
      authority: SERIES,
      programId: address(QUPON_BONDS_PROGRAM_ADDRESS),
    },
  ],
};

describe("hook detection and init_hook", () => {
  it("a mint is hooked only when its TransferHook program is this program", () => {
    const codec = getMintCodec();
    expect(mintIsHooked(codec.decode(codec.encode(hookedMintArgs)))).toBe(true);
    const legacy = codec.decode(
      codec.encode({ ...hookedMintArgs, extensions: [] }),
    );
    expect(mintIsHooked(legacy)).toBe(false);
    const foreign = codec.decode(
      codec.encode({
        ...hookedMintArgs,
        extensions: [
          {
            __kind: "TransferHook" as const,
            authority: SERIES,
            programId: DST,
          },
        ],
      }),
    );
    expect(mintIsHooked(foreign)).toBe(false);
  });

  it("init_hook derives the extra-account-metas PDA and the create tx initializes TransferHook = this program", async () => {
    const series = await seriesPda(MINT);
    const initHook = await getInitHookInstructionAsync({
      registrar: createNoopSigner(SERIES),
      series,
      mint: MINT,
    });
    expect(initHook.accounts.map((a) => a.address)).toEqual([
      SERIES,
      series,
      MINT,
      (await seed("extra-account-metas", MINT))[0],
      address("11111111111111111111111111111111"),
    ]);
    const hookInit = getInitializeTransferHookInstruction({
      mint: MINT,
      authority: series,
      programId: QUPON_BONDS_PROGRAM_ADDRESS,
    });
    expect(hookInit.accounts.length).toBe(1);
  });
});
