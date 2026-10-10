/** Snapshot-hash tests against fixtures/snapshot_hash.json (both on-chain schemes). */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { snapshotHash } from "./snapshotHash.js";

interface Holder {
  owner: string;
  units: number;
}

interface Case {
  id: string;
  scheme: number;
  action: string;
  holders: Holder[];
  hash: string;
}

const fixtures = JSON.parse(
  readFileSync(
    new URL("../../../../fixtures/snapshot_hash.json", import.meta.url),
    "utf8",
  ),
) as { cases: Case[] };

describe("snapshotHash vectors", () => {
  for (const c of fixtures.cases) {
    it(c.id, () => {
      const got = snapshotHash(
        c.scheme,
        c.action,
        c.holders.map((h) => ({ owner: h.owner, units: BigInt(h.units) })),
      );
      expect(Buffer.from(got).toString("hex")).toBe(c.hash);
    });
  }

  it("scheme 1 order independence is pinned by the vectors (one hash, two orders)", () => {
    const asc = fixtures.cases.find((c) => c.id === "scheme1_order_asc");
    const desc = fixtures.cases.find((c) => c.id === "scheme1_order_desc");
    expect(
      asc && desc && asc.hash === desc.hash && asc.action === desc.action,
    ).toBe(true);
  });
});
