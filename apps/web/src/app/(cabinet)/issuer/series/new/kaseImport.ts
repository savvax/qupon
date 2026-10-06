"use server";

import { getKaseBond, type KaseBond } from "@/lib/kase";

/** Wizard "Import from KASE": fetch the normalised bond by ticker. Returns a
 * result object instead of throwing so the client sees the API's code
 * (kase_not_found / kase_unavailable) regardless of Next's error redaction. */
export async function importFromKase(
  ticker: string,
): Promise<{ ok: true; bond: KaseBond } | { ok: false; code: string }> {
  try {
    return { ok: true, bond: await getKaseBond(ticker) };
  } catch (e) {
    return { ok: false, code: (e as { code?: string })?.code ?? "kase_unavailable" };
  }
}
