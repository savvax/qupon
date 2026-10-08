import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token" }) }),
  headers: async () => new Headers(),
}));

import { getSession } from "./session";

describe("getSession", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a 200 HTML body as signed out instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html><body>proxy error page</body></html>", {
            status: 200,
          }),
      ),
    );
    expect(await getSession()).toBeNull();
  });
});
