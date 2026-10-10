/**
 * Shared proof-manifest writer for the demo scripts (task 1526, plan 15 D10a).
 * Every Qupon step a demo run sends is recorded with its signature and expected
 * Anchor event; `write()` emits `reports/devnet-proof-<kind>.json` and rebuilds
 * the combined `reports/devnet-proof.json` from all per-kind manifests, so the
 * combined file always equals the union of the latest run of each kind.
 * `qupon proof:verify <file>` re-fetches each step from devnet and checks it.
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  PAY_BATCH_MAX,
  SNAPSHOT_BATCH_MAX,
  sortedBatches,
} from "../../src/commands/action.js";
import type { ProofManifest, ProofStep } from "../../src/lib/proof.js";

/** CLI instruction → the Anchor event its transaction must have emitted.
 * Steps not listed (kyc:attest, trade:fund, mint creation, Squads governance)
 * are not Qupon-program transactions and are not recorded. */
const EXPECTED_EVENTS: Readonly<Record<string, string>> = {
  "series:init": "SeriesInitialized",
  "investor:register": "InvestorRegistered",
  subscribe: "Subscribed",
  "action:announce": "ActionAnnounced",
  "meeting:announce": "ActionAnnounced",
  "action:strike": "RecordStruck",
  "action:snapshot": "HolderSnapshotted",
  "action:finalize-snapshot": "SnapshotFinalized",
  "action:fund": "ActionFunded",
  "action:pay": "EntitlementPaid",
  "action:complete": "ActionCompleted",
  "action:retire": "UnitsRetired",
  "series:close": "SeriesClosed",
  vote: "VoteCast",
  "meeting:finalize": "MeetingFinalized",
  "meeting:apply": "TermsChanged",
  "trade:create": "TradeAdmitted",
  "trade:settle": "TradeReleased",
  "trade:cancel": "TradeReleased",
};

/** Expected Anchor event of a CLI instruction; undefined = not a Qupon step, do not record. */
export function expectedEventFor(
  instruction: string | undefined,
): string | undefined {
  return instruction === undefined ? undefined : EXPECTED_EVENTS[instruction];
}

export interface ProofWriterOptions {
  /** Manifest kind: "full", "coupon", "squads", "trade" — names the per-kind file. */
  readonly kind: string;
  /** Directory receiving `devnet-proof-*.json` (repo `reports/`). */
  readonly reportsDir: string;
  readonly programId: string;
  readonly cluster?: string;
}

export class ProofWriter {
  private readonly steps: ProofStep[] = [];

  constructor(private readonly opts: ProofWriterOptions) {}

  get count(): number {
    return this.steps.length;
  }

  /**
   * Record one CLI step: one manifest step per transaction signature (ids stay unique via a
   * counter). `instruction` decides the expected event when `expect` is not given explicitly.
   */
  record(input: {
    readonly label: string;
    readonly signatures: readonly string[];
    readonly slot?: number | string | bigint;
    readonly instruction: string;
    readonly expect?: ProofStep["expect"];
  }): void {
    // Only Qupon-program transactions belong in the manifest: an instruction without a known
    // Anchor event (kyc:attest, trade:fund, mint creation) is skipped unless expect is explicit.
    const event = input.expect?.event ?? expectedEventFor(input.instruction);
    if (input.expect?.event === undefined && event === undefined) return;
    const expect = input.expect ?? { event: event as string };
    const slot =
      input.slot === undefined || input.slot === null
        ? null
        : Number(input.slot);
    input.signatures.forEach((signature, i) => {
      this.steps.push({
        id: `${this.opts.kind}/${String(this.steps.length + 1).padStart(3, "0")}-${slug(input.label)}${i === 0 ? "" : `#${i + 1}`}`,
        label: input.label,
        signature,
        slot,
        instruction: input.instruction,
        expect,
      });
    });
  }

  /** Per-holder expectations for one batched instruction (`action:pay` → EntitlementPaid, `action:snapshot` →
   * HolderSnapshotted), so the manifest proves the amounts, not just that an event fired (plan 15 D10a).
   * `units`/`gross` are the demo's expected values (the brief's numbers), never read back from the chain. */
  recordHolders(input: {
    readonly label: string;
    readonly instruction: "action:pay" | "action:snapshot";
    readonly signatures: readonly string[];
    readonly holders: readonly {
      readonly name?: string;
      readonly owner: string;
      readonly units: bigint;
      readonly gross?: bigint;
    }[];
  }): void {
    const event = expectedEventFor(input.instruction);
    if (event === undefined)
      throw new Error(`no expected event for ${input.instruction}`);
    const batchSize =
      input.instruction === "action:pay" ? PAY_BATCH_MAX : SNAPSHOT_BATCH_MAX;
    const owners = input.holders.map((h) => h.owner);
    for (const h of input.holders) {
      const fields: Record<string, string | number> = {
        owner: h.owner,
        units: Number(h.units),
      };
      if (h.gross !== undefined) fields.gross = Number(h.gross);
      this.record({
        label: `${input.label} — ${h.name ?? h.owner.slice(0, 8)}`,
        signatures: [
          batchSigForOwner(
            input.signatures,
            owners,
            h.owner,
            batchSize,
            input.instruction,
          ),
        ],
        instruction: input.instruction,
        expect: { event, fields },
      });
    }
  }

  /** Write the per-kind manifest and rebuild the combined `devnet-proof.json`. */
  write(): string[] {
    mkdirSync(this.opts.reportsDir, { recursive: true });
    const perKind = join(
      this.opts.reportsDir,
      `devnet-proof-${this.opts.kind}.json`,
    );
    writeFileSync(perKind, `${JSON.stringify(this.manifest(), null, "\t")}\n`);
    const combined = join(this.opts.reportsDir, "devnet-proof.json");
    writeFileSync(combined, `${JSON.stringify(this.combined(), null, "\t")}\n`);
    return [perKind, combined];
  }

  private manifest(): ProofManifest {
    return {
      version: 1,
      cluster: this.opts.cluster ?? "devnet",
      programId: this.opts.programId,
      generatedAt: new Date().toISOString(),
      steps: this.steps,
    };
  }

  /** Union of the steps of every per-kind manifest on disk (dedup by id, this run wins). */
  private combined(): ProofManifest {
    const byId = new Map<string, ProofStep>();
    let generatedAt = "";
    for (const file of readdirSync(this.opts.reportsDir)
      .filter((f) => /^devnet-proof-.*\.json$/.test(f))
      .sort()) {
      let manifest: ProofManifest;
      try {
        manifest = JSON.parse(
          readFileSync(join(this.opts.reportsDir, file), "utf8"),
        ) as ProofManifest;
      } catch {
        continue; // unreadable leftovers must not break the run
      }
      for (const step of manifest.steps ?? []) byId.set(step.id, step);
      generatedAt =
        generatedAt < manifest.generatedAt ? manifest.generatedAt : generatedAt;
    }
    for (const step of this.steps) byId.set(step.id, step); // this run is authoritative
    return {
      ...this.manifest(),
      generatedAt: generatedAt || this.manifest().generatedAt,
      steps: [...byId.values()],
    };
  }
}

const slug = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

/**
 * Signature of the batch transaction that contains `owner`. Holders are paid/snapshotted in
 * owner-ascending order in fixed-size batches (the same deterministic rule as src/commands/action.ts),
 * so one signature means every holder is in it and several signatures map by batch index; anything
 * that does not line up (e.g. a wire-size split) throws rather than record a wrong expectation.
 */
function batchSigForOwner(
  signatures: readonly string[],
  owners: readonly string[],
  owner: string,
  batchSize: number,
  instruction: string,
): string {
  if (signatures.length === 1) return signatures[0] as string;
  const index = sortedBatches(owners, (o) => o, batchSize).findIndex((batch) =>
    batch.includes(owner),
  );
  if (index < 0 || index >= signatures.length) {
    throw new Error(
      `${instruction}: cannot map ${owner} to one of ${signatures.length} batch transactions`,
    );
  }
  return signatures[index] as string;
}
