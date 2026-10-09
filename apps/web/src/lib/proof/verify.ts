/**
 * The proof page's verifier: recomputes what the program recorded for every corporate action of a series from the
 * raw chain data (`chain.ts`) and says, check by check, whether it matches. Pure apart from SHA-256 (WebCrypto),
 * so the same code runs in the browser, in unit tests on `fixtures/accounts` and on recorded devnet responses.
 */
import { getAddressEncoder, getU64Encoder } from "@solana/kit";
import {
  type CorporateAction,
  type Entitlement,
} from "@qupon/client/src/generated";
import { computeEntitlement, kindFromCode } from "@qupon/client/src/lib/entitlement";
import type { ChainTx, Decoded, ProofInput } from "./chain";

export type CheckStatus = "pass" | "fail" | "pending" | "info";
export type CheckId =
  | "entitlements"
  | "supply"
  | "hash"
  | "totals"
  | "funded"
  | "payouts"
  | "default"
  | "bank"
  | "disclosure";

/** One verdict with the numbers behind it (the page turns them into a one-line explanation). */
export interface Check {
  id: CheckId;
  status: CheckStatus;
  v: Record<string, bigint | number | string>;
  /** The transaction that carries the fact, when there is one (disclosure attach, default). */
  tx?: string;
}

export type Amounts = { gross: bigint; tax: bigint; net: bigint; principal: bigint };

export interface HolderRow {
  owner: string;
  units: bigint;
  taxBps: number | null;
  onchain: Amounts;
  /** null when the inputs could not be recomputed (no Investor record, invalid parameters). */
  expected: Amounts | null;
  status: number;
  ok: boolean;
}

export interface ActionReport {
  address: string;
  index: number;
  kind: number;
  corpId: string;
  status: number;
  recordAt: bigint;
  paymentAt: bigint;
  rateBps: number;
  accrualDays: number;
  hashScheme: number;
  units: bigint;
  required: bigint;
  holders: HolderRow[];
  checks: Check[];
  txs: ChainTx[];
}

export interface ProofReport {
  input: ProofInput;
  actions: ActionReport[];
  /** Series transactions not tied to one action (issuance, registration, routes, trades). */
  seriesTxs: ChainTx[];
  passed: number;
  failed: number;
}

/** CorporateAction.status codes (docs/02-architecture.md). */
export const ACTION_STATUS = [
  "Announced",
  "RecordStruck",
  "SnapshotComplete",
  "Funded",
  "Settling",
  "Completed",
  "Retiring",
  "Cancelled",
  "VotingOpen",
  "Finalized",
  "Defaulted",
] as const;
const S = Object.fromEntries(ACTION_STATUS.map((s, i) => [s, i])) as Record<
  (typeof ACTION_STATUS)[number],
  number
>;
/** Entitlement.status: 0 Snapshotted, 1 Paid, 2 Retired, 3 PaidToAgent — every non-zero status left the escrow. */
const PAID_TO_AGENT = 3;
const CASH_KINDS = new Set([0, 1, 2, 3]);
const PCAL = 3;

const addr = getAddressEncoder();
const u64 = getU64Encoder();
const enc = new TextEncoder();
const SNAP_DOMAIN = enc.encode("qupon:snap:v1");

export const hex = (b: ArrayLike<number>) =>
  Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

async function sha256(...parts: ArrayLike<number>[]): Promise<Uint8Array> {
  const len = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

function cmpBytes(a: ArrayLike<number>, b: ArrayLike<number>) {
  for (let i = 0; i < a.length; i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The snapshot hash the program keeps, recomputed from the entitlements.
 * Scheme 0 (`snapshot_hash_step`): sha256(prev ‖ owner ‖ units_le) over holders by owner bytes ascending, from 32
 * zero bytes. Scheme 1 (`set_hash_leaf`, plan 15 D3): XOR over holders of sha256("qupon:snap:v1" ‖ action ‖ owner ‖
 * units_le) — order-independent, so permissionless batches in any order land on the same value.
 */
export async function snapshotHash(
  scheme: number,
  action: string,
  holders: { owner: string; units: bigint }[],
): Promise<string> {
  let acc: Uint8Array = new Uint8Array(32);
  if (scheme === 1) {
    for (const h of holders) {
      const leaf = await sha256(
        SNAP_DOMAIN,
        addr.encode(action as never),
        addr.encode(h.owner as never),
        u64.encode(h.units),
      );
      acc = acc.map((x, i) => x ^ (leaf[i] ?? 0));
    }
  } else {
    const sorted = holders
      .map((h) => ({ key: addr.encode(h.owner as never), units: h.units }))
      .sort((a, b) => cmpBytes(a.key, b.key));
    for (const h of sorted) acc = await sha256(acc, h.key, u64.encode(h.units));
  }
  return hex(acc);
}

const ascii = (b: ArrayLike<number>) =>
  String.fromCharCode(...Array.from(b).filter((x) => x !== 0));

const sum = <T>(xs: T[], f: (x: T) => bigint) => xs.reduce((n, x) => n + f(x), 0n);

/**
 * Face value each action was computed on: a completed partial call (PCAL) lowers the series face, so an earlier
 * action used the current face plus every later-or-same PCAL's per-unit principal.
 */
function faceAt(input: ProofInput, a: CorporateAction): bigint {
  return input.actions
    .filter(
      (b) =>
        b.data.kind === PCAL &&
        b.data.status === S.Completed &&
        b.data.index >= a.index,
    )
    .reduce((f, b) => f + b.data.perUnitPrincipal, input.series.data.faceValue);
}

function recompute(
  input: ProofInput,
  a: CorporateAction,
  e: Entitlement,
  taxBps: number | null,
): Amounts | null {
  if (taxBps === null) return null;
  try {
    return computeEntitlement({
      units: e.units,
      face: faceAt(input, a),
      rateBps: a.rateBps,
      dayCount: input.series.data.dayCount,
      days: a.accrualDays,
      taxBps,
      kind: kindFromCode(a.kind),
      factorBps: a.factorBps,
    });
  } catch {
    return null;
  }
}

const same = (x: Amounts, y: Amounts | null) =>
  !!y && x.gross === y.gross && x.tax === y.tax && x.net === y.net && x.principal === y.principal;

/** Change of `owner`'s balance of `mint` in one transaction. */
const deltaOf = (t: ChainTx, owner: string | null, mint: string) =>
  t.failed
    ? 0n
    : t.deltas
        .filter((d) => d.mint === mint && (owner === null || d.owner === owner))
        .reduce((n, d) => n + d.delta, 0n);

async function verifyAction(
  input: ProofInput,
  { address, data: a }: Decoded<CorporateAction>,
  ents: Decoded<Entitlement>[],
): Promise<ActionReport> {
  const taxByOwner = new Map(
    input.investors.map((i) => [String(i.data.owner), i.data.taxRateBps]),
  );
  const holders: HolderRow[] = ents.map(({ data: e }) => {
    const onchain = { gross: e.gross, tax: e.tax, net: e.net, principal: e.principal };
    const taxBps = taxByOwner.get(String(e.owner)) ?? null;
    const expected = recompute(input, a, e, taxBps);
    return {
      owner: String(e.owner),
      units: e.units,
      taxBps,
      onchain,
      expected,
      status: e.status,
      ok: same(onchain, expected),
    };
  });
  holders.sort((x, y) => (y.units > x.units ? 1 : y.units < x.units ? -1 : 0));

  const txs = input.txs.filter((t) => t.keys.includes(address));
  const escrow = (t: ChainTx) => deltaOf(t, address, a.cashMint);
  const required = a.totalNet + a.totalTax + a.totalPrincipal;
  const units = sum(ents, (e) => e.data.units);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const cancelled = a.status === S.Cancelled;
  // Checks that replay the token ledger wait for the whole transaction history.
  const ledger = input.txDone >= input.txTotal;
  const snapshotted = a.status !== S.Announced && !cancelled;

  if (snapshotted) {
    // 1. Every holder's amounts, recomputed with the crate's integer math (half-up per holder).
    const ok = holders.filter((h) => h.ok).length;
    add({
      id: "entitlements",
      status: ok === holders.length && holders.length > 0 ? "pass" : "fail",
      v: { ok, total: holders.length },
    });

    // 2. Σ units against the bond supply at the record date, rebuilt from every mint and burn of the series.
    // ponytail: a holder's own burn (no Qupon instruction) is invisible here; the program allows Σ ≥ supply then.
    const fin = input.txs.findIndex(
      (t) => !t.failed && t.ixs.includes("FinalizeSnapshot") && t.keys.includes(address),
    );
    if (!ledger || fin < 0) add({ id: "supply", status: "pending", v: { units } });
    else {
      const supply = sum(input.txs.slice(0, fin), (t) =>
        deltaOf(t, null, input.series.data.mint),
      );
      const hooked = input.series.data.hook === 1;
      add({
        id: "supply",
        status:
          units === a.unitsSnapshotted && (units === supply || (hooked && units > supply))
            ? "pass"
            : "fail",
        v: { units, supply, onchain: a.unitsSnapshotted },
      });
    }

    // 3. Snapshot hash in the action's scheme.
    const expected = await snapshotHash(
      a.hashScheme,
      address,
      ents.map((e) => ({ owner: String(e.data.owner), units: e.data.units })),
    );
    const onchain = hex(a.snapshotHash);
    add({
      id: "hash",
      status: expected === onchain ? "pass" : "fail",
      v: { scheme: a.hashScheme, expected, onchain },
    });

    // 4. The action's totals = Σ of its entitlements (amounts, holders, paid).
    const paid = ents.filter((e) => e.data.status !== 0);
    const pairs: [string, bigint, bigint][] = [
      ["holders", BigInt(ents.length), BigInt(a.holdersSnapshotted)],
      ["gross", sum(ents, (e) => e.data.gross), a.totalGross],
      ["tax", sum(ents, (e) => e.data.tax), a.totalTax],
      ["net", sum(ents, (e) => e.data.net), a.totalNet],
      ["principal", sum(ents, (e) => e.data.principal), a.totalPrincipal],
      ["paidHolders", BigInt(paid.length), BigInt(a.holdersPaid)],
      ["paid", sum(paid, (e) => e.data.net + e.data.principal), a.totalPaid],
    ];
    const bad = pairs.filter(([, x, y]) => x !== y).map(([k]) => k);
    add({
      id: "totals",
      status: bad.length ? "fail" : "pass",
      v: {
        bad: bad.join(", "),
        gross: a.totalGross,
        net: a.totalNet,
        tax: a.totalTax,
        principal: a.totalPrincipal,
        holders: a.holdersSnapshotted,
      },
    });

    if (CASH_KINDS.has(a.kind)) {
      // 5. The escrow received what the holders are owed.
      const deposited = sum(txs, (t) => {
        const d = escrow(t);
        return d > 0n ? d : 0n;
      });
      const due =
        a.status >= S.Funded && a.status <= S.Retiring ? true : a.curedAt !== 0n;
      add({
        id: "funded",
        status: !ledger || !due ? "pending" : deposited >= required ? "pass" : "fail",
        v: { deposited, required },
      });

      // 6. What left the escrow in pay_batch = net + principal + tax of every paid holder.
      const paidOut = -sum(
        txs.filter((t) => t.ixs.includes("PayBatch")),
        escrow,
      );
      const owed = sum(paid, (e) => e.data.net + e.data.principal + e.data.tax);
      add({
        id: "payouts",
        status: !ledger || paid.length === 0 ? "pending" : paidOut === owed ? "pass" : "fail",
        v: { paidOut, owed, holders: paid.length, total: ents.length },
      });
    }
  }

  // 7. Default and cure: the escrow really was short when the default was declared, and full after the cure.
  if (a.defaultedAt !== 0n) {
    const at = input.txs.findIndex(
      (t) => !t.failed && t.ixs.includes("DeclareDefault") && t.keys.includes(address),
    );
    const before = at < 0 ? null : sum(input.txs.slice(0, at), escrow);
    const deposited = sum(txs, (t) => (escrow(t) > 0n ? escrow(t) : 0n));
    const cured = a.curedAt !== 0n;
    const justified = before !== null && before < required;
    add({
      id: "default",
      status: !ledger
        ? "pending"
        : justified && (!cured || deposited >= required)
          ? "pass"
          : "fail",
      v: {
        balance: before ?? 0n,
        required,
        cured: cured ? 1 : 0,
        late: cured ? a.curedAt - a.defaultedAt : 0n,
      },
      tx: at < 0 ? undefined : input.txs[at]?.signature,
    });
  }

  // 8. Bank-routed payouts: the agent's pending count equals the entitlements still marked PaidToAgent.
  const confirmed = txs.filter((t) => !t.failed && t.ixs.includes("ConfirmBankPayout")).length;
  const atAgent = ents.filter((e) => e.data.status === PAID_TO_AGENT).length;
  if (confirmed > 0 || atAgent > 0 || a.bankPending > 0)
    add({
      id: "bank",
      status: atAgent === a.bankPending ? "pass" : "fail",
      v: { pending: a.bankPending, confirmed },
    });

  // 9. Disclosure anchored on-chain (plan 15 D9): present or absent, never a failure.
  const dh = hex(a.disclosureHash);
  const attach = txs.find((t) => !t.failed && t.ixs.includes("AttachDisclosure"));
  add({
    id: "disclosure",
    status: /^0+$/.test(dh) ? "info" : "pass",
    v: { hash: dh },
    tx: attach?.signature,
  });

  return {
    address,
    index: a.index,
    kind: a.kind,
    corpId: ascii(a.corpId),
    status: a.status,
    recordAt: a.recordAt,
    paymentAt: a.paymentAt,
    rateBps: a.rateBps,
    accrualDays: a.accrualDays,
    hashScheme: a.hashScheme,
    units,
    required,
    holders,
    checks,
    txs,
  };
}

/** Verify every corporate action of the series. */
export async function verifyProof(input: ProofInput): Promise<ProofReport> {
  const actions = await Promise.all(
    input.actions.map((a) => verifyAction(input, a, input.entitlements[a.address] ?? [])),
  );
  const tied = new Set(actions.flatMap((a) => a.txs.map((t) => t.signature)));
  const all = actions.flatMap((a) => a.checks);
  return {
    input,
    actions,
    seriesTxs: input.txs.filter((t) => !tied.has(t.signature)),
    passed: all.filter((c) => c.status === "pass").length,
    failed: all.filter((c) => c.status === "fail").length,
  };
}
