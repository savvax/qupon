import { afterEach, describe, expect, it } from "vitest";
import { answeredByRpc, createProofRpc } from "./endpoints";

const A = "https://rpc-a.example";
const B = "https://rpc-b.example";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** Stub fetch: endpoint A always refuses, endpoint B answers getSlot. */
function stubFetch(aStatus: number) {
  globalThis.fetch = (async (url: string | URL | Request) => {
    if (String(url) === A) {
      return new Response(JSON.stringify({ error: { code: -32005 } }), {
        status: aStatus,
      });
    }
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", id: 1, result: 1234 }),
      { status: 200 },
    );
  }) as typeof fetch;
}

describe("proof RPC fallback", () => {
  it("retries against the second endpoint when the first refuses", async () => {
    stubFetch(429);
    const rpc = createProofRpc([A, B]);
    await expect(rpc.getSlot().send()).resolves.toBe(1234n);
    expect(answeredByRpc()).toBe(B);
  });

  it("uses the first endpoint when it answers", async () => {
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url) === A) {
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: 42 }),
          { status: 200 },
        );
      }
      throw new Error("should not be called");
    }) as typeof fetch;
    const rpc = createProofRpc([A, B]);
    await expect(rpc.getSlot().send()).resolves.toBe(42n);
    expect(answeredByRpc()).toBe(A);
  });

  it("spreads consecutive requests across endpoints (round-robin, task 91579)", async () => {
    globalThis.fetch = (async (url: string | URL | Request) =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: String(url) === A ? 42 : 4242,
        }),
        { status: 200 },
      )) as typeof fetch;
    const rpc = createProofRpc([A, B]);
    await expect(rpc.getSlot().send()).resolves.toBe(42n); // starts at the first endpoint
    await expect(rpc.getSlot().send()).resolves.toBe(4242n); // …then the second, so parallel walks share the load
    await expect(rpc.getSlot().send()).resolves.toBe(42n);
  });

  const OF = "https://solana-devnet.api.onfinality.io/public";

  it("never sends history reads to a history-less lane (91579)", async () => {
    let ofCalled = false;
    globalThis.fetch = (async (url: string | URL | Request) => {
      if (String(url) === OF) {
        ofCalled = true;
        return new Response(
          JSON.stringify({ jsonrpc: "2.0", id: 1, result: null }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: 1, result: { slot: 1 } }),
        { status: 200 },
      );
    }) as typeof fetch;
    const rpc = createProofRpc([OF, A]);
    // getTransaction on OnFinality answers `null` as a success — the walk must skip that lane entirely.
    await expect(
      rpc.getTransaction("1" as never, { encoding: "json" } as never).send(),
    ).resolves.toEqual({ slot: 1n });
    expect(ofCalled).toBe(false);
    expect(answeredByRpc()).toBe(A);
  });

  it("still uses a history-less lane for non-history reads (91579)", async () => {
    globalThis.fetch = (async (url: string | URL | Request) =>
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: String(url) === OF ? 7 : 9,
        }),
        { status: 200 },
      )) as typeof fetch;
    const rpc = createProofRpc([OF, A]);
    await expect(rpc.getSlot().send()).resolves.toBe(7n); // OnFinality is fine for account reads
    expect(answeredByRpc()).toBe(OF);
  });

  it("throws when every endpoint refuses", async () => {
    globalThis.fetch = (async () =>
      new Response("{}", { status: 503 })) as typeof fetch;
    const rpc = createProofRpc([A, B]);
    await expect(rpc.getSlot().send()).rejects.toThrow();
  });
});
