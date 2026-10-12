/**
 * Proof page loader: everything the verifier needs, read straight from a Solana RPC node in the browser (no
 * registrar, no Qupon server). Accounts are decoded with the Codama client shared with the CLI; transactions are
 * reduced to the facts the checks use (which Qupon instruction ran, token balance changes).
 */
import {
  type Address,
  type Base58EncodedBytes,
  type ReadonlyUint8Array,
  type Rpc,
  type Signature,
  type SolanaRpcApi,
  address,
  getBase58Decoder,
  getBase58Encoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  CORPORATE_ACTION_DISCRIMINATOR,
  type CorporateAction,
  ENTITLEMENT_DISCRIMINATOR,
  type Entitlement,
  INVESTOR_DISCRIMINATOR,
  type Investor,
  QUPON_BONDS_PROGRAM_ADDRESS,
  QuponBondsInstruction,
  type Series,
  getCorporateActionDecoder,
  getEntitlementDecoder,
  getInvestorDecoder,
  getSeriesDecoder,
  identifyQuponBondsInstruction,
} from "@qupon/client/src/generated";
import { seriesPda, entitlementPda } from "@qupon/client/src/lib/pda";

export type Decoded<T> = { address: Address; data: T };

/** One transaction of the series, oldest first: which Qupon instructions ran and how token balances moved. */
export interface ChainTx {
  signature: string;
  slot: bigint;
  /** Unix seconds (null when the node does not know it). */
  blockTime: number | null;
  failed: boolean;
  /** Qupon instruction names in order (top level first, then CPI), e.g. ["SnapshotBatch"]; [] = another program. */
  ixs: string[];
  /** Every account the transaction touched (static keys + lookup tables). */
  keys: string[];
  /** Non-zero token balance changes: token account owner, mint, post − pre in base units. */
  deltas: { owner: string; mint: string; delta: bigint }[];
}

export interface ProofInput {
  mint: string;
  series: Decoded<Series>;
  /** Current bond supply; null once the mint is closed (redeemed series). */
  bondSupply: bigint | null;
  cashDecimals: number;
  actions: Decoded<CorporateAction>[];
  investors: Decoded<Investor>[];
  /** Entitlements by action address. */
  entitlements: Record<string, Decoded<Entitlement>[]>;
  /** Transactions loaded so far, oldest first; the ledger checks wait until `txDone === txTotal`. */
  txs: ChainTx[];
  txTotal: number;
  txDone: number;
  /** Slot the page read at. */
  slot: bigint;
}

export type ProofRpc = Rpc<SolanaRpcApi>;

const b64 = getBase64Encoder();
const b58 = getBase58Encoder();
const b58s = getBase58Decoder();
const asBytes = (data: readonly [string, string]) => b64.encode(data[0]);
const memcmp = (offset: number, bytes: ReadonlyUint8Array | string) => ({
  memcmp: {
    offset: BigInt(offset),
    bytes: (typeof bytes === "string"
      ? bytes
      : b58s.decode(bytes)) as Base58EncodedBytes,
    encoding: "base58" as const,
  },
});
const startsWith = (data: ReadonlyUint8Array, prefix: ReadonlyUint8Array) =>
  prefix.every((b, i) => data[i] === b);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry transient RPC failures (the transport in endpoints.ts already paces per node) with backoff. */
async function retry<T>(fn: () => Promise<T>, tries = 12): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await sleep(Math.min(500 * 2 ** i, 5000) * (0.75 + Math.random() / 2));
    }
  }
}

/** Map with at most `n` requests in flight (keeps a public RPC node from rate-limiting the page). */
async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const k = next++;
        out[k] = await fn(items[k] as T);
      }
      return undefined; // worker value unused — Promise.all only awaits settlement
    }),
  );
  return out;
}

function ixName(data: string): string | null {
  try {
    return QuponBondsInstruction[
      identifyQuponBondsInstruction(b58.encode(data))
    ];
  } catch {
    return null; // not one of ours (another program sharing the id is impossible, but stay total)
  }
}

type RawIx = { programIdIndex: number; data: string };
type RawBal = {
  accountIndex: number;
  mint: string;
  owner?: string;
  uiTokenAmount: { amount: string };
};
type RawTx = {
  slot: bigint;
  blockTime: bigint | number | null;
  meta: {
    err: unknown;
    loadedAddresses?: {
      writable: readonly string[];
      readonly: readonly string[];
    };
    innerInstructions?: readonly { instructions: readonly RawIx[] }[] | null;
    preTokenBalances?: readonly RawBal[] | null;
    postTokenBalances?: readonly RawBal[] | null;
  } | null;
  transaction: {
    message: { accountKeys: readonly string[]; instructions: readonly RawIx[] };
  };
};

/** Reduce a `getTransaction` (json encoding) result to the facts the verifier uses. */
export function parseTx(signature: string, raw: RawTx): ChainTx {
  const meta = raw.meta;
  const keys = [
    ...raw.transaction.message.accountKeys,
    ...(meta?.loadedAddresses?.writable ?? []),
    ...(meta?.loadedAddresses?.readonly ?? []),
  ].map(String);
  const ours = (list: readonly RawIx[]) =>
    list
      .filter((ix) => keys[ix.programIdIndex] === QUPON_BONDS_PROGRAM_ADDRESS)
      .map((ix) => ixName(ix.data))
      .filter((n): n is string => n !== null);
  const ixs = [
    ...ours(raw.transaction.message.instructions),
    ...ours((meta?.innerInstructions ?? []).flatMap((i) => i.instructions)),
  ];
  const bal = new Map<number, { owner: string; mint: string; delta: bigint }>();
  const add = (list: readonly RawBal[] | null | undefined, sign: bigint) => {
    for (const b of list ?? []) {
      const cur = bal.get(b.accountIndex) ?? {
        owner: b.owner ?? "",
        mint: b.mint,
        delta: 0n,
      };
      cur.delta += sign * BigInt(b.uiTokenAmount.amount);
      bal.set(b.accountIndex, cur);
    }
  };
  add(meta?.preTokenBalances, -1n);
  add(meta?.postTokenBalances, 1n);
  return {
    signature,
    slot: BigInt(raw.slot),
    blockTime: raw.blockTime == null ? null : Number(raw.blockTime),
    failed: meta?.err != null,
    ixs,
    keys,
    deltas: [...bal.values()].filter((d) => d.delta !== 0n),
  };
}

/** Every signature that touched `addr`, oldest first (pages of 1,000). */
async function allSignatures(rpc: ProofRpc, addr: Address) {
  const out: { signature: Signature }[] = [];
  let before: Signature | undefined;
  for (;;) {
    const page = await retry(() =>
      rpc.getSignaturesForAddress(addr, { limit: 1000, before }).send(),
    );
    out.push(...page);
    if (page.length < 1000) break;
    before = page[page.length - 1]?.signature;
  }
  return out.reverse();
}

/**
 * Read one bond series from the chain: the Series, its investors and corporate actions, every action's
 * entitlements, the bond and cash mints, then every transaction that touched the series (fetched ~7 at a
 * time across the RPC endpoints, so a public node's rate limit slows the walk instead of stalling it).
 * `onUpdate` fires once the accounts are in and again after each transaction, so the page shows the account
 * checks at once and the ledger checks when the history is complete.
 */
export async function loadProof(
  rpc: ProofRpc,
  mintStr: string,
  onUpdate?: (input: ProofInput) => void,
): Promise<ProofInput | null> {
  const mint = address(mintStr);
  const seriesAddr = await seriesPda(mint);
  const program = QUPON_BONDS_PROGRAM_ADDRESS;
  const seriesInfo = await retry(() =>
    rpc.getAccountInfo(seriesAddr, { encoding: "base64" }).send(),
  );
  if (!seriesInfo.value) return null;
  // Codama reads Borsh in order: a `None` open_action is one byte and the stale 32-byte tail is ignored.
  const series = getSeriesDecoder().decode(asBytes(seriesInfo.value.data));

  const [children, mints, sigs, slot] = await Promise.all([
    retry(() =>
      rpc
        .getProgramAccounts(program, {
          encoding: "base64",
          filters: [memcmp(9, seriesAddr)],
        })
        .send(),
    ),
    retry(() =>
      rpc
        .getMultipleAccounts([mint, series.cashMint], { encoding: "base64" })
        .send(),
    ),
    allSignatures(rpc, seriesAddr),
    retry(() => rpc.getSlot().send()),
  ]);

  const actions: Decoded<CorporateAction>[] = [];
  const investors: Decoded<Investor>[] = [];
  for (const c of children) {
    const data = asBytes(c.account.data);
    if (startsWith(data, CORPORATE_ACTION_DISCRIMINATOR))
      actions.push({
        address: c.pubkey,
        data: getCorporateActionDecoder().decode(data),
      });
    else if (startsWith(data, INVESTOR_DISCRIMINATOR))
      investors.push({
        address: c.pubkey,
        data: getInvestorDecoder().decode(data),
      });
  }
  actions.sort((a, b) => a.data.index - b.data.index);

  // Entitlements are PDAs of (action, owner): derive them for every action × registered investor and read
  // them with one batched getMultipleAccounts per 100 (task 91579) instead of one getProgramAccounts per
  // action. A missed entitlement cannot slip through silently — the action's own totals and hash checks
  // compare Σ entitlements against what the program recorded and fail loudly on any gap.
  const owners = [...new Set(investors.map((i) => String(i.data.owner)))];
  const entAddrs = await Promise.all(
    actions.flatMap((a) =>
      owners.map((o) => entitlementPda(a.address, address(o))),
    ),
  );
  const entitlements: Record<string, Decoded<Entitlement>[]> = {};
  for (let k = 0; k < entAddrs.length; k += 100) {
    const chunk = entAddrs.slice(k, k + 100);
    const rows = await retry(() =>
      rpc.getMultipleAccounts(chunk, { encoding: "base64" }).send(),
    );
    rows.value.forEach((acc, j) => {
      if (!acc) return; // this (action, owner) pair has no entitlement — never snapshotted
      const data = asBytes(acc.data);
      if (!startsWith(data, ENTITLEMENT_DISCRIMINATOR)) return;
      const e = getEntitlementDecoder().decode(data);
      (entitlements[String(e.action)] ??= []).push({
        address: chunk[j] as Address,
        data: e,
      });
    });
  }

  // SPL mint layout: supply u64 at 36, decimals u8 at 44 (same for Token and Token-2022).
  const [bondMint, cashMint] = mints.value;
  const u64At = (d: ReadonlyUint8Array, o: number) =>
    new DataView(d.buffer, d.byteOffset).getBigUint64(o, true);

  const loaded: (ChainTx | null)[] = new Array(sigs.length).fill(null);
  let txDone = 0;
  const snapshot = (): ProofInput => ({
    mint: mintStr,
    series: { address: seriesAddr, data: series },
    bondSupply: bondMint ? u64At(asBytes(bondMint.data), 36) : null,
    cashDecimals: cashMint ? (asBytes(cashMint.data)[44] ?? 0) : 0,
    actions,
    investors,
    entitlements,
    txs: loaded.filter((t): t is ChainTx => t !== null),
    txTotal: sigs.length,
    txDone,
    slot,
  });
  onUpdate?.(snapshot());
  await pool(
    sigs.map((s, i) => [s.signature, i] as const),
    7,
    async ([signature, i]) => {
      // A node without the full history answers null for a signature we know exists (it came from
      // getSignaturesForAddress) — retry so another endpoint can serve it; only a null from all of them
      // counts as "nowhere to be read" (the affected checks will say so) (task 91579).
      let raw: unknown = null;
      try {
        raw = await retry(async () => {
          const r = await rpc
            .getTransaction(signature, {
              encoding: "json",
              maxSupportedTransactionVersion: 0,
            })
            .send();
          if (r === null) throw new Error(`node did not serve ${signature}`);
          return r;
        }, 6);
      } catch {
        raw = null; // no endpoint could serve it
      }
      // SAFETY: the transport returns the node's `getTransaction` json-encoding result, which matches RawTx.
      loaded[i] = raw ? parseTx(signature, raw as unknown as RawTx) : null;
      txDone++;
      onUpdate?.(snapshot());
    },
  );
  return snapshot();
}
