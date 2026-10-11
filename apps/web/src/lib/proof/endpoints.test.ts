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

  it("throws when every endpoint refuses", async () => {
    globalThis.fetch = (async () =>
      new Response("{}", { status: 503 })) as typeof fetch;
    const rpc = createProofRpc([A, B]);
    await expect(rpc.getSlot().send()).rejects.toThrow();
  });
});
