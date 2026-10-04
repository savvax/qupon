import { getBase58Encoder } from "@solana/kit";

/** Sort items by owner pubkey ascending (base58 decoded to bytes). Matches on-chain snapshot hash order. */
export function sortByOwner<T>(items: T[], ownerOf: (item: T) => string): T[] {
  const enc = getBase58Encoder();
  return [...items].sort((a, b) => {
    const ab = enc.encode(ownerOf(a));
    const bb = enc.encode(ownerOf(b));
    for (let i = 0; i < 32; i++) {
      const x = ab[i] ?? 0;
      const y = bb[i] ?? 0;
      if (x !== y) return x - y;
    }
    return 0;
  });
}

/** Fixed-size chunks for batch instructions (remaining_accounts triples). */
export function chunk<T>(items: readonly T[], n: number): T[][] {
  if (n < 1) throw new Error(`chunk size must be >= 1, got ${n}`);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
