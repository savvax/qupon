import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { generateKeyPairSigner, type Signature } from "@solana/kit";
import {
  anchorErrorFromLogs,
  computeUnitLimit,
  createRpc,
  isTransient,
  sendInstructions,
  statusFallbackUrl,
  waitForConfirmation,
  type QuponRpc,
} from "./tx.js";

describe("computeUnitLimit", () => {
  it("encodes SetComputeUnitLimit (tag 2, u32 LE) for the ComputeBudget program", () => {
    const ix = computeUnitLimit(600_000);
    expect(ix.programAddress).toBe(
      "ComputeBudget111111111111111111111111111111",
    );
    expect(Array.from(ix.data ?? [])).toEqual([2, 0xc0, 0x27, 0x09, 0x00]);
    expect(ix.accounts ?? []).toEqual([]);
  });
});

describe("isTransient", () => {
  it("retries network and 429/5xx failures only", () => {
    expect(isTransient(new TypeError("fetch failed"))).toBe(true);
    expect(
      isTransient(
        Object.assign(new Error("HTTP error (429): Too Many Requests"), {}),
      ),
    ).toBe(true);
    expect(
      isTransient(
        Object.assign(new Error("x"), { context: { statusCode: 503 } }),
      ),
    ).toBe(true);
    expect(isTransient(new Error("custom program error: 0x1771"))).toBe(false);
  });
});

describe("anchorErrorFromLogs", () => {
  it("extracts the program error name, number and message", () => {
    const logs = [
      "Program QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd invoke [1]",
      "Program log: AnchorError thrown in programs/qupon_bonds/src/instructions/snapshot.rs:40. Error Code: TooEarly. Error Number: 6006. Error Message: Too early for this step.",
      "Program QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd failed: custom program error: 0x1776",
    ];
    expect(anchorErrorFromLogs(logs)).toBe(
      "TooEarly (6006): Too early for this step",
    );
  });
  it("is undefined without an Anchor error", () => {
    expect(anchorErrorFromLogs(undefined)).toBeUndefined();
    expect(
      anchorErrorFromLogs(["Program log: Error: insufficient funds"]),
    ).toBeUndefined();
  });
});

describe("statusFallbackUrl", () => {
  const saved = {
    RPC_URL: process.env.RPC_URL,
    RPC_FALLBACK_URL: process.env.RPC_FALLBACK_URL,
  };
  afterEach(() => {
    for (const [k, v] of Object.entries(saved))
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
  });
  it("never falls back to devnet when the primary RPC is mainnet", () => {
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    delete process.env.RPC_FALLBACK_URL;
    expect(statusFallbackUrl()).toBeUndefined();
  });
  it("honors RPC_FALLBACK_URL on any cluster", () => {
    process.env.RPC_URL = "https://api.mainnet-beta.solana.com";
    process.env.RPC_FALLBACK_URL = "https://fallback.example";
    expect(statusFallbackUrl()).toBe("https://fallback.example");
  });
  it("defaults to public devnet only when the primary RPC is devnet", () => {
    process.env.RPC_URL = "https://devnet.helius-rpc.com/?api-key=x";
    delete process.env.RPC_FALLBACK_URL;
    expect(statusFallbackUrl()).toBe("https://api.devnet.solana.com");
  });
});

describe("waitForConfirmation", () => {
  const sig =
    "5g4SZtuSXhGy5SBCkptJthvqVHaA2WrFdaP7rxhebZTVwGgtHm3QvUCpUMZXiQaXQ6p5E73cxdmzAFwMSBMRK2h3" as Signature;
  const statusRpc = (impl: () => unknown) =>
    ({
      getSignatureStatuses: () => ({ send: async () => impl() }),
    }) as unknown as Parameters<typeof waitForConfirmation>[0];
  it("asks the fallback RPC when the primary fails the status call", async () => {
    const primary = statusRpc(() => {
      throw new Error(
        "JSON-RPC error: Internal JSON-RPC error (Internal error)",
      );
    });
    const fallback = statusRpc(() => ({
      value: [{ confirmationStatus: "confirmed", err: null }],
    }));
    await expect(
      waitForConfirmation(primary, sig, 5_000, () => fallback),
    ).resolves.toBe(sig);
  });
  it("reports an on-chain failure", async () => {
    const primary = statusRpc(() => ({
      value: [
        {
          confirmationStatus: "confirmed",
          err: { InstructionError: [0, { Custom: 6006 }] },
        },
      ],
    }));
    await expect(waitForConfirmation(primary, sig, 5_000)).rejects.toThrow(
      /transaction failed/,
    );
  });
  it("throws 'block height exceeded' once the chain passes lastValidBlockHeight", async () => {
    const rpc = {
      getSignatureStatuses: () => ({ send: async () => ({ value: [null] }) }),
      getBlockHeight: () => ({ send: async () => 200n }),
    } as unknown as Parameters<typeof waitForConfirmation>[0];
    await expect(
      waitForConfirmation(rpc, sig, 5_000, undefined, 199n),
    ).rejects.toThrow(/block height exceeded/);
  });
});

describe("sendInstructions", () => {
  it("re-signs with a fresh blockhash once the old one's block height passes", async () => {
    const payer = await generateKeyPairSigner();
    const lvbh = [100n, 200n]; // lastValidBlockHeight per attempt
    const heights = [99n, 101n, 103n]; // chain height per poll
    const statuses = [
      null,
      null,
      null,
      { confirmationStatus: "confirmed", err: null },
    ]; // status per poll
    const sends: string[] = [];
    let heightI = 0;
    let statusI = 0;
    let attempt = -1;
    const rpc = {
      getLatestBlockhash: () => ({
        send: async () => {
          attempt++;
          return {
            value: {
              blockhash: ["1".repeat(32), "2".repeat(32)][attempt],
              lastValidBlockHeight: lvbh[attempt],
            },
          };
        },
      }),
      sendTransaction: (wire: string) => ({
        send: async () => sends.push(wire),
      }),
      getSignatureStatuses: () => ({
        send: async () => ({ value: [statuses[statusI++]] }),
      }),
      getBlockHeight: () => ({ send: async () => heights[heightI++] }),
    } as unknown as QuponRpc;
    const sig = await sendInstructions(
      rpc,
      payer,
      [computeUnitLimit(1)],
      "test",
    );
    expect(typeof sig).toBe("string");
    expect(attempt).toBe(1); // two blockhash fetches: the first expired, a fresh one for the re-sign
    expect(sends).toHaveLength(2);
    expect(sends[0]).not.toBe(sends[1]); // second send is a differently-signed transaction
    expect(statusI).toBe(4); // no premature throw: polls 1-3 saw null status without failing
    expect(heightI).toBe(3);
  }, 10_000);
});

describe("createRpc", () => {
  it("retries a stubbed 429 on a custom --rpc endpoint", async () => {
    let calls = 0;
    const server = createServer((_req, res) => {
      calls++;
      if (calls === 1) {
        res.writeHead(429, { "content-type": "application/json" });
        res.end(
          '{"jsonrpc":"2.0","id":1,"error":{"code":-32005,"message":"Too many requests"}}',
        );
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"jsonrpc":"2.0","id":1,"result":42}');
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const rpc = createRpc(
        `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      );
      expect(await rpc.getBlockHeight().send()).toBe(42n);
      expect(calls).toBe(2);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, 10_000);
});
