import { describe, expect, it } from "vitest";
import { currentAction } from "../../lib/sandbox";
import { FIXTURES, mockCreate, mockSandbox, mockScenario } from "./sandbox";

const NOW = Date.parse("2026-10-09T10:00:00Z");
const at = (fx: string) => {
  const s = mockSandbox(`fx-${fx}`, NOW)!;
  return { s, a: currentAction(s) };
};

describe("mock sandbox: one frozen fixture per state", () => {
  it.each([
    ["issued", undefined],
    ["announced", "Announced"],
    ["snapshot", "RecordStruck"],
    ["funding", "SnapshotComplete"],
    ["funded", "Funded"],
    ["paying", "Settling"],
    ["bank", "Settling"],
    ["paid", "Completed"],
    ["skipped", "SnapshotComplete"],
    ["defaulted", "Defaulted"],
    ["cured", "Completed"],
    ["maturity", "Settling"],
    ["redeemed", "Completed"],
  ])("%s → %s", (fx, status) => {
    expect(at(fx).a?.status).toBe(status);
  });

  it("covers every fixture", () => {
    for (const fx of Object.keys(FIXTURES)) expect(mockSandbox(`fx-${fx}`, NOW), fx).toBeDefined();
  });

  it("pays the brief's numbers: 500 / 1,250 / 3,250 gross, 15 % tax for the pension fund, bank route", () => {
    const { s, a } = at("bank");
    expect(s.entitlements.map((e) => e.gross?.minor)).toEqual(["50000", "125000", "325000"]);
    expect(s.entitlements.map((e) => e.tax?.minor)).toEqual(["0", "0", "48750"]);
    expect(s.entitlements.map((e) => e.status)).toEqual(["Paid", "Paid", "PaidToAgent"]);
    expect(a?.bankPending).toBe(1);
    expect(s.next.step).toBe("confirm_bank");
  });

  it("snapshot fills holder by holder", () => {
    expect(at("snapshot").s.entitlements).toHaveLength(2);
    expect(at("funding").s.entitlements).toHaveLength(3);
  });

  it("default, then cure: the claims stay with the record-date holders", () => {
    const d = at("defaulted");
    expect(d.s.series.inDefault).toBe(true);
    expect(d.s.next).toEqual({ step: "fund", actor: "issuer", at: null });
    expect(d.s.activity[0]?.kind).toBe("ActionDefaulted");
    const c = at("cured");
    expect(c.a?.curedAt).toBeTruthy();
    expect(c.s.entitlements.every((e) => e.status === "Paid")).toBe(true);
  });

  it("maturity pays coupon + principal and burns; then the series closes", () => {
    const m = at("maturity");
    expect(m.a?.kind).toBe("REDM");
    expect(m.s.activity.some((e) => e.kind === "UnitsRetired")).toBe(true);
    const r = at("redeemed");
    expect(r.s.series.status).toBe("Closed");
    expect(r.s.holders.every((h) => h.units === "0")).toBe(true);
  });

  it("a wallet holder waits for its own claim", () => {
    const { s } = at("wallet");
    const me = s.entitlements.find((e) => e.owner === s.wallet);
    expect(me?.units).toBe("5");
    expect(me?.status).toBe("Snapshotted");
  });
});

describe("mock sandbox: create and scenarios", () => {
  it("is idempotent per request id and validates the wallet", () => {
    const a = mockCreate({ requestId: "t-1" }, NOW);
    expect(mockCreate({ requestId: "t-1" }, NOW + 5).id).toBe(a.id);
    expect(a.ticker).toMatch(/^SBX-[A-Z0-9]{6}$/);
    expect(() => mockCreate({ requestId: "t-2", wallet: "nope" }, NOW)).toThrow(/base58/);
    expect(() => mockCreate({ requestId: "throttle-1" }, NOW)).toThrow(/per hour/);
  });

  it("trades 5 bonds with accrued interest and refuses a non-KYC transfer", () => {
    const { id } = mockCreate({ requestId: "t-3" }, NOW);
    const trade = mockScenario(id, "dvp_trade", NOW + 20_000);
    expect(trade.trade?.units).toBe("5");
    expect(BigInt(trade.trade!.cash.minor)).toBe(BigInt(trade.trade!.clean.minor) + BigInt(trade.trade!.accrued.minor));
    expect(Number(trade.trade!.accrued.minor)).toBeGreaterThan(0);
    const refused = mockScenario(id, "non_kyc_transfer", NOW + 21_000);
    expect(refused.error).toBe("AccountFrozen");
    expect(() => mockScenario(id, "cure", NOW + 22_000)).toThrow(/nothing to cure/);
    // the trade moved the register: 15 / 20 / 65
    expect(mockSandbox(id, NOW + 23_000)!.holders.map((h) => h.units)).toEqual(["15", "20", "65"]);
  });

  it("a scenario unfreezes a suffixed fixture; bare fixtures stay read-only", () => {
    expect(() => mockScenario("fx-defaulted", "cure", NOW)).toThrow(/read-only/);
    const cured = mockScenario("fx-defaulted-x1", "cure", NOW);
    expect(cured.signatures).toHaveLength(1);
    // it lives on: coupon 1 is paid late (cured), coupon 2 is announced
    const later = mockSandbox("fx-defaulted-x1", NOW + 10_000)!;
    expect(later.actions[0]).toMatchObject({ status: "Completed", curedAt: expect.any(String) });
    expect(currentAction(later)?.status).toBe("Announced");
  });
});
