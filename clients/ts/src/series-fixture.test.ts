import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeSeries, getSeriesSize, SERIES_DISCRIMINATOR } from "./generated/accounts/series.js";
import { QUPON_PROGRAM_ID } from "./index.js";

// Raw Series account (incl. 8-byte Anchor discriminator) exported from a LiteSVM
// run of init_series — regenerate with
// `QUPON_EXPORT_FIXTURE=1 cargo test -p qupon_bonds export_series_fixture`.
const b64 = readFileSync(fileURLToPath(new URL("../test/fixtures/series.b64", import.meta.url)), "utf8");
const data = new Uint8Array(Buffer.from(b64.trim(), "base64"));

// Mirror of Env::params() in programs/qupon_bonds/tests/common/mod.rs.
describe("generated Series decoder (Codama)", () => {
  it("decodes a real Series account exported from LiteSVM", () => {
    const series = decodeSeries({ address: QUPON_PROGRAM_ID, data }).data;
    expect(series.discriminator).toEqual(SERIES_DISCRIMINATOR);
    expect(Buffer.from(series.isin).toString("ascii")).toBe("KZ2C0QUPON01");
    expect(Buffer.from(series.ticker.subarray(0, 5)).toString("ascii")).toBe("QPNb1");
    expect(series.faceValue).toBe(100_000n);
    expect(series.couponRateBps).toBe(1000);
    expect(series.frequency).toBe(2);
    expect(series.dayCount).toBe(0);
    expect(series.issueDate).toBe(1_783_018_800n);
    expect(series.maturityDate).toBe(1_846_177_200n);
    expect(series.nextCouponDate).toBe(1_798_916_400n);
    expect(series.periodStart).toBe(1_783_018_800n);
    expect(series.status).toBe(0); // Active
    expect(series.totalIssued).toBe(0n);
    expect(series.actionCount).toBe(0);
    expect(series.quorumBps).toBe(5000);
    expect(series.approvalBps).toBe(6667);
  });

  it("layout is fixed-size and matches the fixture length", () => {
    expect(data).toHaveLength(getSeriesSize());
  });
});
