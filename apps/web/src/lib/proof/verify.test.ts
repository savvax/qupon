import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { type Address, getAddressDecoder, getAddressEncoder, none } from "@solana/kit";
import {
  getCorporateActionDecoder,
  getEntitlementDecoder,
  getInvestorDecoder,
  getSeriesDecoder,
  getSeriesEncoder,
} from "@qupon/client/src/generated";
import { describe, expect, it } from "vitest";
import type { ProofInput } from "./chain";
import { hex, snapshotHash, verifyProof } from "./verify";

/** Real account bytes written by the program (fixtures/accounts, LiteSVM run of the brief's coupon). */
const dir = join(__dirname, "../../../../../fixtures/accounts");
const raw = (k: string) =>
  new Uint8Array(Buffer.from(readFileSync(join(dir, `${k}.b64`), "utf8").trim(), "base64"));
const json = (k: string) =>
  JSON.parse(readFileSync(join(dir, `${k}.json`), "utf8")) as {
    pubkey: Address;
    expected: Record<string, unknown>;
  };

const series = getSeriesDecoder().decode(raw("series"));
const action = getCorporateActionDecoder().decode(raw("action"));
const investor = getInvestorDecoder().decode(raw("investor"));
const ent = getEntitlementDecoder().decode(raw("entitlement"));

function input(over: Partial<ProofInput> = {}): ProofInput {
  const a = json("action").pubkey;
  return {
    mint: String(series.mint),
    series: { address: json("series").pubkey, data: series },
    bondSupply: 100n,
    cashDecimals: 2,
    actions: [{ address: a, data: action }],
    investors: [{ address: json("investor").pubkey, data: investor }],
    entitlements: { [a]: [{ address: json("entitlement").pubkey, data: ent }] },
    txs: [],
    txTotal: 0,
    txDone: 0,
    slot: 1n,
    ...over,
  };
}

describe("decoders on real account bytes", () => {
  it("read every plan-15 field the verifier uses", () => {
    const a = json("action").expected;
    expect(action.hashScheme).toBe(a.hash_scheme);
    expect(hex(action.snapshotHash)).toBe(a.snapshot_hash);
    expect(action.totalGross).toBe(BigInt(a.total_gross as number));
    expect(action.bankPending).toBe(a.bank_pending);
    expect(hex(action.disclosureHash)).toBe(a.disclosure_hash);
    expect(investor.taxRateBps).toBe(json("investor").expected.tax_rate_bps);
    expect(ent.net).toBe(BigInt(json("entitlement").expected.net as number));
    expect(series.issueYmd).toBe(json("series").expected.issue_ymd);
  });

  it("Series with open_action None: the stale 32-byte tail is ignored, never required to be zero", () => {
    const closed = getSeriesEncoder().encode({ ...series, openAction: none() });
    expect(closed.length).toBe(raw("series").length - 32);
    const onChain = new Uint8Array([...closed, ...new Array(32).fill(0xab)]); // the account keeps its 389 bytes
    const back = getSeriesDecoder().decode(onChain);
    expect(back.openAction).toEqual(none());
    expect(back.issueYmd).toBe(series.issueYmd);
    expect(back.daySecs).toBe(series.daySecs);
    expect(back.inDefault).toBe(series.inDefault);
  });
});

describe("verifyProof on fixtures/accounts", () => {
  it("recomputes the taxed holder's entitlement (10 bonds, 10% withheld → 500.00 gross, 450.00 net)", async () => {
    const r = await verifyProof(input());
    const [a] = r.actions;
    expect(a!.holders[0]).toMatchObject({
      units: 10n,
      taxBps: 1000,
      ok: true,
      expected: { gross: 50_000n, tax: 5_000n, net: 45_000n, principal: 0n },
    });
    expect(a!.checks.find((c) => c.id === "entitlements")).toMatchObject({
      status: "pass",
      v: { ok: 1, total: 1 },
    });
  });

  it("a register missing two of three holders fails the hash and the totals", async () => {
    const r = await verifyProof(input());
    const st = Object.fromEntries(r.actions[0]!.checks.map((c) => [c.id, c.status]));
    expect(st.hash).toBe("fail");
    expect(st.totals).toBe("fail");
    expect(r.actions[0]!.checks.find((c) => c.id === "totals")!.v.bad).toContain("holders");
  });

  it("a tampered amount is caught", async () => {
    const a = json("action").pubkey;
    const r = await verifyProof(
      input({
        entitlements: {
          [a]: [{ address: json("entitlement").pubkey, data: { ...ent, net: ent.net + 1n } }],
        },
      }),
    );
    expect(r.actions[0]!.holders[0]!.ok).toBe(false);
    expect(r.actions[0]!.checks[0]).toMatchObject({ id: "entitlements", status: "fail" });
  });

  it("without an Investor record the tax rate is unknown and the holder fails", async () => {
    const r = await verifyProof(input({ investors: [] }));
    expect(r.actions[0]!.holders[0]).toMatchObject({ expected: null, ok: false });
  });

  it("ledger checks wait for the whole transaction history", async () => {
    const r = await verifyProof(input({ txTotal: 5, txDone: 2 }));
    const st = Object.fromEntries(r.actions[0]!.checks.map((c) => [c.id, c.status]));
    expect([st.supply, st.funded, st.payouts]).toEqual(["pending", "pending", "pending"]);
    expect(st.disclosure).toBe("info"); // nothing anchored on this action: absent, not a failure
  });
});

describe("snapshot hash schemes", () => {
  const A = "11111111111111111111111111111111";
  // owners in non-ascending order; bytes 0x01…, 0x02…, 0x03… once encoded
  const enc = getAddressEncoder();
  const owner = (b: number) => {
    const bytes = new Uint8Array(32);
    bytes[0] = b;
    return getAddressDecoder().decode(bytes) as string;
  };
  const holders = [
    { owner: owner(3), units: 65n },
    { owner: owner(1), units: 10n },
    { owner: owner(2), units: 25n },
  ];
  const le = (n: bigint) => {
    const b = Buffer.alloc(8);
    b.writeBigUInt64LE(n);
    return b;
  };
  const sha = (...p: Uint8Array[]) => createHash("sha256").update(Buffer.concat(p)).digest();

  it("scheme 0 = sha256(prev ‖ owner ‖ units_le) over owners ascending, from zeros", async () => {
    let h: Buffer = Buffer.alloc(32);
    for (const x of [holders[1]!, holders[2]!, holders[0]!]) // 0x01…, 0x02…, 0x03…
      h = sha(h, enc.encode(x.owner as Address) as Uint8Array, le(x.units));
    expect(await snapshotHash(0, A, holders)).toBe(h.toString("hex"));
  });

  it("scheme 1 = XOR of sha256('qupon:snap:v1' ‖ action ‖ owner ‖ units_le), any order", async () => {
    const acc = Buffer.alloc(32);
    for (const x of holders) {
      const leaf = sha(
        Buffer.from("qupon:snap:v1"),
        enc.encode(A as Address) as Uint8Array,
        enc.encode(x.owner as Address) as Uint8Array,
        le(x.units),
      );
      for (let i = 0; i < 32; i++) acc[i]! ^= leaf[i]!;
    }
    expect(await snapshotHash(1, A, holders)).toBe(acc.toString("hex"));
    expect(await snapshotHash(1, A, [...holders].reverse())).toBe(acc.toString("hex"));
  });
});
