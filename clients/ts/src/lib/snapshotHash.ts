/**
 * Snapshot-hash recomputation mirroring `programs/qupon_bonds/src/instructions/snapshot.rs`:
 * scheme 0 (legacy) rolls sha256(prev ‖ owner ‖ units_le) over holders sorted by owner bytes ascending;
 * scheme 1 XORs sha256("qupon:snap:v1" ‖ action ‖ owner ‖ units_le) per holder (order-independent).
 * Zero-unit holders contribute nothing (the program skips them in `add_units`).
 * Vectors: fixtures/snapshot_hash.json.
 */
import { createHash } from "node:crypto";
import { getAddressEncoder, type Address } from "@solana/kit";

const addr = getAddressEncoder();

/** One holder at the record date. */
export interface SnapshotHolder {
  readonly owner: Address;
  readonly units: bigint;
}

function sha256(...parts: Uint8Array[]) {
  const h = createHash("sha256");
  for (const p of parts) h.update(p);
  return new Uint8Array(h.digest());
}

function le64(v: bigint): Uint8Array {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function compareAddresses(a: Address, b: Address): number {
  const x = addr.encode(a);
  const y = addr.encode(b);
  for (let i = 0; i < 32; i++) {
    if (x[i] !== y[i]) return (x[i] ?? 0) - (y[i] ?? 0);
  }
  return 0;
}

/** kit's encoder hands out a readonly view; hashing only reads it. */
function addressBytes(a: Address): Uint8Array {
  return addr.encode(a) as Uint8Array;
}

/** Recompute the on-chain `snapshot_hash` of a corporate action over its holders. */
export function snapshotHash(
  scheme: number,
  action: Address,
  holders: readonly SnapshotHolder[],
): Uint8Array {
  const nonzero = holders.filter((h) => h.units > 0n);
  if (scheme === 0) {
    const sorted = [...nonzero].sort((a, b) =>
      compareAddresses(a.owner, b.owner),
    );
    let prev = new Uint8Array(32);
    for (const h of sorted) {
      prev = sha256(prev, addressBytes(h.owner), le64(h.units));
    }
    return prev;
  }
  if (scheme === 1) {
    const acc = new Uint8Array(32);
    const actionBytes = addressBytes(action);
    for (const h of nonzero) {
      const leaf = sha256(
        new TextEncoder().encode("qupon:snap:v1"),
        actionBytes,
        addressBytes(h.owner),
        le64(h.units),
      );
      for (let i = 0; i < 32; i++) acc[i] = (acc[i] ?? 0) ^ (leaf[i] ?? 0);
    }
    return acc;
  }
  throw new RangeError(`unknown hash scheme ${scheme}`);
}
