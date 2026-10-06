import { describe, expect, it } from "vitest";
import {
  CATALOG,
  connectPlan,
  shortAddress,
  toInstall,
  usable,
} from "./wallets";

describe("wallet connect rules", () => {
  it("connects the only wallet directly, lets the user pick among several, explains when none", () => {
    expect(connectPlan(0)).toBe("none");
    expect(connectPlan(1)).toBe("direct");
    expect(connectPlan(3)).toBe("pick");
  });
  it("counts installed and loadable wallets only", () => {
    const ws = [
      { name: "Phantom", readyState: "Installed" as const },
      { name: "MWA", readyState: "Loadable" as const },
      { name: "Ledger", readyState: "NotDetected" as const },
      { name: "Old", readyState: "Unsupported" as const },
    ];
    expect(usable(ws).map((w) => w.name)).toEqual(["Phantom", "MWA"]);
  });
  it("suggests the catalog wallets that are not installed", () => {
    expect(toInstall(["phantom"]).map((c) => c.name)).toEqual([
      "Solflare",
      "Backpack",
    ]);
    expect(toInstall([])).toHaveLength(CATALOG.length);
  });
  it("builds mobile deep links that reopen this page inside the wallet", () => {
    const url = "https://qupon.example/investor?x=1";
    expect(CATALOG[0].browse(url, "https://qupon.example")).toBe(
      "https://phantom.app/ul/browse/https%3A%2F%2Fqupon.example%2Finvestor%3Fx%3D1?ref=https%3A%2F%2Fqupon.example",
    );
  });
  it("shortens addresses", () => {
    expect(shortAddress("DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo")).toBe(
      "DL8G…aJEo",
    );
  });
});
