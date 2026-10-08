import { describe, expect, it, vi } from "vitest";

// The size cap must hold before any request-scope call (cookies) — the tests
// below exercise paths that return before auth, but the mock keeps the module
// importable outside a Next request.
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token" }) }),
  headers: async () => new Headers(),
}));

import { POST } from "./route";

const MAX_BYTES = 10 * 1024 * 1024 + 64 * 1024;

/** Minimal Request stand-in: multipart headers, optional Content-Length, chunked body. */
function uploadReq(chunks: Uint8Array[], contentLength?: number): Request {
  let i = 0;
  const headers = new Headers({
    "content-type": "multipart/form-data; boundary=b",
  });
  if (contentLength !== undefined)
    headers.set("content-length", String(contentLength));
  return {
    headers,
    get body() {
      return {
        getReader: () => ({
          read: async () =>
            i < chunks.length
              ? { done: false as const, value: chunks[i++] }
              : { done: true as const, value: undefined },
          cancel: async () => {},
        }),
      };
    },
  } as unknown as Request;
}

const ctx = { params: Promise.resolve({ path: ["me", "documents"] }) };

describe("bo-upload size cap", () => {
  it("rejects a body without Content-Length (411, not buffered)", async () => {
    const res = await POST(uploadReq([new Uint8Array(8)]), ctx);
    expect(res.status).toBe(411);
    expect((await res.json()).code).toBe("length_required");
  });

  it("rejects a declared Content-Length above the cap (413)", async () => {
    const res = await POST(uploadReq([], MAX_BYTES + 1), ctx);
    expect(res.status).toBe(413);
  });

  it("aborts a chunked body streaming past the cap despite a small Content-Length (413)", async () => {
    const res = await POST(uploadReq([new Uint8Array(MAX_BYTES + 1)], 8), ctx);
    expect(res.status).toBe(413);
    expect((await res.json()).code).toBe("too_large");
  });
});
