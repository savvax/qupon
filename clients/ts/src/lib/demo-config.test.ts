import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoConfigPath, loadDemoConfig, type DemoConfig } from "./config.js";

const raw = JSON.parse(readFileSync(demoConfigPath(), "utf8")) as Record<string, unknown>;
const c = loadDemoConfig();

function date(s: string): Date {
  const d = new Date(`${s}T00:00:00Z`);
  expect(Number.isNaN(d.getTime()), `bad civil date '${s}'`).toBe(false);
  return d;
}

describe("config/demo.json", () => {
  it("has only the known series and cash mints", () => {
    expect(Object.keys(c.series).sort()).toEqual(["BTRKdemo", "QPNb1"]);
    expect(c.series.QPNb1.cashMint).toBe("tKZT");
    expect(c.series.BTRKdemo.cashMint).toBe("USDC");
  });

  it("matches devnet.json series parameters", () => {
    const devnet = JSON.parse(
      readFileSync(new URL("../../../../config/devnet.json", import.meta.url), "utf8"),
    ) as { series: Record<string, { faceValue: number; couponRateBps: number; frequency: number; dayCount: string }> };
    for (const [name, s] of Object.entries(c.series)) {
      const d = devnet.series[name];
      expect(d, `${name} missing from devnet.json`).toBeDefined();
      expect(s.faceValue).toBe(d.faceValue);
      expect(s.couponRateBps).toBe(d.couponRateBps);
      expect(s.frequency).toBe(d.frequency);
      expect(s.dayCount).toBe(d.dayCount);
    }
  });

  it("has chronological coupon periods and maturity after issue", () => {
    for (const s of Object.values(c.series)) {
      expect(date(s.maturityDate).getTime()).toBeGreaterThan(date(s.issueDate).getTime());
      let prev = date(s.issueDate).getTime();
      for (const p of s.couponPeriods) {
        const start = date(p.start).getTime();
        const end = date(p.end).getTime();
        expect(start).toBe(prev);
        expect(end).toBeGreaterThan(start);
        prev = end;
      }
    }
  });

  it("QPNb1 first period matches the fixture vector (2026-07-03 → 2027-01-03, 180d)", () => {
    const p = c.series.QPNb1.couponPeriods[0];
    expect(p).toEqual({ start: "2026-07-03", end: "2027-01-03", days: 180 });
  });

  it("MCAL call date and accrued days match the fixture (2026-08-20, 47d)", () => {
    const m = c.series.BTRKdemo.mcal;
    expect(m).toBeDefined();
    expect(m!.callDate).toBe("2026-08-20");
    expect(m!.accrualStart).toBe("2026-07-03");
    expect(m!.accruedDays).toBe(47);
  });

  it("QPNb1 investors subscribe the brief's 10/25/65 units with distinct indices", () => {
    const inv = c.series.QPNb1.investors;
    expect(inv.map((i) => i.units)).toEqual([10, 25, 65]);
    expect(new Set(inv.map((i) => i.index)).size).toBe(3);
  });

  // BTRK-demo is scaled to devnet faucet limits (20 USDC per wallet / 2 h): face 1 USDC, 3/3/4 units.
  it("BTRKdemo investors sum to 10 units with distinct indices", () => {
    const inv = c.series.BTRKdemo.investors;
    expect(inv.reduce((a, i) => a + i.units, 0)).toBe(10);
    expect(new Set(inv.map((i) => i.index)).size).toBe(3);
  });

  it("offsets compress real time within sane bounds", () => {
    const { recordAtOffsetSec, paymentAtOffsetSec, votingWindowSec } = c.offsets;
    for (const v of [recordAtOffsetSec, paymentAtOffsetSec, votingWindowSec]) {
      expect(v).toBeGreaterThanOrEqual(30);
      expect(v).toBeLessThanOrEqual(3600);
    }
    expect(paymentAtOffsetSec).toBeGreaterThan(recordAtOffsetSec);
  });

  it("vote plan covers all 100 units and clears its own thresholds", () => {
    const { votes, quorumBps, approvalBps } = c.votePlan;
    const total = votes.reduce((a, v) => a + v.units, 0);
    expect(total).toBe(100);
    const forU = votes.filter((v) => v.choice === "for").reduce((a, v) => a + v.units, 0);
    const cast = votes.filter((v) => v.choice !== "abstain").reduce((a, v) => a + v.units, 0);
    expect(forU).toBe(65);
    expect(cast).toBe(90);
    expect((forU * 10000) / cast >= approvalBps).toBe(true); // 7222 ≥ 6667
    expect((cast * 10000) / total >= quorumBps).toBe(true); // 9000 ≥ 5000
    expect(c.votePlan.proposal.newRateBps).toBeGreaterThan(c.series.QPNb1.couponRateBps);
  });

  it("is valid JSON conforming to the structural contract", () => {
    // Minimal structural contract mirrored from config/demo.schema.json
    // (no ajv dependency; the schema file stays authoritative for editors).
    expect(typeof raw.series).toBe("object");
    expect(typeof raw.offsets).toBe("object");
    expect(typeof raw.votePlan).toBe("object");
    const cfg = c as DemoConfig;
    for (const s of Object.values(cfg.series)) {
      expect(s.investors.length).toBe(3);
      expect(s.couponPeriods.length).toBeGreaterThan(0);
      expect(s.pricePerUnit).toBeGreaterThan(0);
    }
  });
});
