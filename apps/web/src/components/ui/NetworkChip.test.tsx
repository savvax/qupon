// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NetworkChip } from "./NetworkChip";

/** Task 91587: on /sandbox/replay the chip must not poll the cluster RPC (the replay page
 *  makes no request to the registrar API or any Solana RPC at view time), even with live=true. */

let pathname = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/components/network/NetworkContext", () => ({
  useNetwork: () => ({ network: "devnet", mainnet: false }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("NetworkChip (task 91587)", () => {
  it("makes no getSlot fetch on /sandbox/replay even when live", async () => {
    pathname = "/en/sandbox/replay";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<NetworkChip slot={123} live />);
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still polls getSlot on other routes when live", async () => {
    pathname = "/en/sandbox/AbC123";
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ json: () => Promise.resolve({}) });
    vi.stubGlobal("fetch", fetchMock);
    render(<NetworkChip slot={123} live />);
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
