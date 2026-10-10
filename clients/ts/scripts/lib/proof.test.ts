/** ProofWriter: per-kind manifest + combined merge (tmp dir, no network). */
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ProofWriter } from "./proof.js";

const dirs: string[] = [];
const newDir = (): string => {
  const d = mkdtempSync(join(tmpdir(), "qupon-proof-"));
  dirs.push(d);
  return d;
};

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("ProofWriter", () => {
  it("records only Qupon-program steps and writes per-kind + combined manifests", () => {
    const dir = newDir();
    const w = new ProofWriter({
      kind: "coupon",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    w.record({
      label: "S0 kyc:attest investor1",
      signatures: ["SIGKYC"],
      instruction: "kyc:attest",
    }); // not Qupon → skipped
    w.record({
      label: "S0 investor:register investor1",
      signatures: ["SIG1"],
      slot: "123",
      instruction: "investor:register",
    });
    w.record({
      label: "S1 action:pay",
      signatures: ["SIG2", "SIG3"],
      instruction: "action:pay",
    });
    expect(w.count).toBe(3);
    w.write();

    const perKind = JSON.parse(
      readFileSync(join(dir, "devnet-proof-coupon.json"), "utf8"),
    ) as {
      version: number;
      cluster: string;
      steps: {
        id: string;
        signature: string;
        slot: number | null;
        expect?: { event?: string };
      }[];
    };
    expect(perKind.version).toBe(1);
    expect(perKind.cluster).toBe("devnet");
    expect(perKind.steps.map((s) => s.signature)).toEqual([
      "SIG1",
      "SIG2",
      "SIG3",
    ]);
    expect(perKind.steps[0]?.slot).toBe(123);
    expect(perKind.steps[0]?.expect?.event).toBe("InvestorRegistered");
    expect(perKind.steps[2]?.id.endsWith("#2")).toBe(true);
    expect(perKind.steps[2]?.expect?.event).toBe("EntitlementPaid");

    const combined = JSON.parse(
      readFileSync(join(dir, "devnet-proof.json"), "utf8"),
    ) as { steps: string[] };
    expect(combined.steps).toHaveLength(3);
  });

  it("records per-holder amounts (owner/units/gross) on pay steps — plan 15 D10a", () => {
    const dir = newDir();
    const w = new ProofWriter({
      kind: "coupon",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    w.recordHolders({
      label: "S1 action:pay",
      instruction: "action:pay",
      signatures: ["SIGPAY"],
      holders: [
        {
          name: "investor1",
          owner: "Demo11111111111111111111111111111111111",
          units: 10n,
          gross: 50_000n,
        },
      ],
    });
    w.write();

    const m = JSON.parse(
      readFileSync(join(dir, "devnet-proof-coupon.json"), "utf8"),
    ) as {
      steps: {
        label: string;
        signature: string;
        expect?: { event?: string; fields?: Record<string, string | number> };
      }[];
    };
    const pay = m.steps[0];
    expect(pay?.label).toBe("S1 action:pay — investor1");
    expect(pay?.signature).toBe("SIGPAY");
    expect(pay?.expect?.event).toBe("EntitlementPaid");
    expect(pay?.expect?.fields?.owner).toBe(
      "Demo11111111111111111111111111111111111",
    );
    expect(pay?.expect?.fields?.units).toBe(10);
    expect(pay?.expect?.fields?.gross).toBe(50000);
  });

  it("maps each holder to its batch transaction when several batches exist (owner-ascending order)", () => {
    const dir = newDir();
    const w = new ProofWriter({
      kind: "full",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    // five holders, PAY_BATCH_MAX = 4: the first four by owner get batch 1 (SIG1), the last gets SIG2
    const owner = (c: string): string => c.repeat(44); // A–E are valid base58, so sortByOwner can order them
    w.recordHolders({
      label: "action:pay",
      instruction: "action:pay",
      signatures: ["SIG1", "SIG2"],
      holders: ["B", "D", "A", "E", "C"].map((c) => ({
        owner: owner(c),
        units: 10n,
      })),
    });
    w.write();
    const m = JSON.parse(
      readFileSync(join(dir, "devnet-proof-full.json"), "utf8"),
    ) as { steps: { signature: string }[] };
    expect(m.steps.map((s) => s.signature)).toEqual([
      "SIG1",
      "SIG1",
      "SIG1",
      "SIG2",
      "SIG1",
    ]); // E sorts last → batch 2
  });

  it("combined manifest is the union of per-kind manifests, latest run of a kind wins", () => {
    const dir = newDir();
    const a = new ProofWriter({
      kind: "coupon",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    a.record({
      label: "register",
      signatures: ["SIG1"],
      instruction: "investor:register",
    });
    a.write();
    const b = new ProofWriter({
      kind: "squads",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    b.record({
      label: "register",
      signatures: ["SIG2"],
      instruction: "investor:register",
    });
    b.write();
    // re-run of kind "coupon" replaces its steps only
    const a2 = new ProofWriter({
      kind: "coupon",
      reportsDir: dir,
      programId: "ProgId1111111111111111111111111111111111",
    });
    a2.record({
      label: "register",
      signatures: ["SIG9"],
      instruction: "investor:register",
    });
    a2.write();

    expect(readdirSync(dir).sort()).toEqual([
      "devnet-proof-coupon.json",
      "devnet-proof-squads.json",
      "devnet-proof.json",
    ]);
    const combined = JSON.parse(
      readFileSync(join(dir, "devnet-proof.json"), "utf8"),
    ) as { steps: { id: string; signature: string }[] };
    expect(combined.steps.map((s) => s.signature).sort()).toEqual([
      "SIG2",
      "SIG9",
    ]);
  });
});
