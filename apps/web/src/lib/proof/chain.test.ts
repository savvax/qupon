import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createSolanaRpcFromTransport } from "@solana/kit";
import { describe, expect, it } from "vitest";
import { loadProof } from "./chain";
import { rpcKey, wireJson } from "./rpcKey";
import { verifyProof } from "./verify";

/**
 * Recorded devnet responses for two real series. PLAN15 (`make demo-plan15`, reports/demo-plan15.md): hooked mint,
 * set-hash snapshot (scheme 1) pushed by an outsider, default + cure, bank-routed payout, anchored disclosure, DvP
 * trade, atomic redemption. LEGACY: a pre-plan-15 series (paused-mint record date, owner-ordered rolling hash,
 * scheme 0) with coupons, a meeting and a redemption. The same file feeds the Playwright spec's mocked RPC.
 * Re-record: `RECORD_PROOF=1 pnpm vitest run src/lib/proof/chain.test.ts` (reads devnet; log lines are dropped).
 */
const FIXTURE = join(__dirname, "../../../e2e/fixtures/proof-rpc.json");
const PLAN15_MINT = "7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F";
const LEGACY_MINT = "E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD";
// A keyed RPC (e.g. RECORD_RPC=$RPC_URL from .env) avoids the public node's ~1 getTransaction/s limit.
const RPC = process.env.RECORD_RPC ?? "https://api.devnet.solana.com";

type Payload = { id: string; method: string; params?: unknown };

function replayRpc(map: Record<string, unknown>) {
  return createSolanaRpcFromTransport(async ({ payload }) => {
    const p = payload as Payload;
    const k = rpcKey(p.method, p.params);
    if (!(k in map)) throw new Error(`not recorded: ${k}`);
    return { jsonrpc: "2.0", id: p.id, result: map[k] } as never;
  });
}

describe("loadProof + verifyProof on recorded devnet data", () => {
  it.skipIf(!process.env.RECORD_PROOF)(
    "records the plan-15 series from devnet",
    async () => {
      const map: Record<string, unknown> = {};
      const rpc = createSolanaRpcFromTransport(async ({ payload }) => {
        const p = payload as Payload;
        const res = await fetch(RPC, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: wireJson(payload),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { result?: { meta?: Record<string, unknown> } };
        if (json.result?.meta) delete json.result.meta.logMessages; // unused, and most of the bytes
        map[rpcKey(p.method, p.params)] = json.result;
        return json as never;
      });
      expect(await loadProof(rpc, PLAN15_MINT)).not.toBeNull();
      expect(await loadProof(rpc, LEGACY_MINT)).not.toBeNull();
      writeFileSync(FIXTURE, `${JSON.stringify(map)}\n`);
    },
    300_000,
  );

  it.skipIf(!existsSync(FIXTURE))("every check passes on the real series", async () => {
    const map = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
    const seen: number[] = [];
    const input = await loadProof(replayRpc(map), PLAN15_MINT, (p) => seen.push(p.txDone));
    expect(input).not.toBeNull();
    const report = await verifyProof(input!);
    const failed = report.actions.flatMap((a) =>
      a.checks.filter((c) => c.status === "fail").map((c) => `${a.corpId}:${c.id}`),
    );
    expect(failed).toEqual([]);
    expect(report.failed).toBe(0);
    expect(seen[0]).toBe(0); // accounts first, then one update per transaction
    expect(seen.at(-1)).toBe(input!.txTotal);

    const [intr, redm] = report.actions;
    // The brief's numbers: 10 / 25 / 65 bonds → 500.00 / 1,250.00 / 3,250.00 ₸.
    expect(intr!.holders.map((h) => [h.units, h.onchain.net])).toEqual([
      [65n, 325_000n],
      [25n, 125_000n],
      [10n, 50_000n],
    ]);
    const ids = (a: typeof intr) => Object.fromEntries(a!.checks.map((c) => [c.id, c.status]));
    expect(ids(intr)).toMatchObject({
      entitlements: "pass",
      supply: "pass",
      hash: "pass",
      totals: "pass",
      funded: "pass",
      payouts: "pass",
      default: "pass",
      bank: "pass",
      disclosure: "pass",
    });
    expect(intr!.hashScheme).toBe(1);
    // Redemption: principal + final coupon, units burned in the same pay_batch, supply then 0 (mint closed).
    expect(redm!.holders.every((h) => h.onchain.principal === h.units * 100_000n)).toBe(true);
    expect(input!.bondSupply).toBeNull();
  });

  it.skipIf(!existsSync(FIXTURE))("scheme 0: the owner-ordered rolling hash matches a legacy series", async () => {
    const map = JSON.parse(readFileSync(FIXTURE, "utf8")) as Record<string, unknown>;
    const report = await verifyProof((await loadProof(replayRpc(map), LEGACY_MINT))!);
    expect(report.actions.length).toBeGreaterThanOrEqual(3);
    for (const a of report.actions) {
      expect(a.hashScheme).toBe(0);
      expect(a.checks.filter((c) => c.status === "fail")).toEqual([]);
      expect(a.checks.find((c) => c.id === "hash")?.status).toBe("pass");
    }
    expect(report.input.series.data.hook).toBe(0);
  });
});
