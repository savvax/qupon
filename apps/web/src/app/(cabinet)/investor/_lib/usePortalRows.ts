"use client";

import { useEffect, useState } from "react";
import { loadPortal, type SeriesRow } from "@/lib/portal";
import { useInvestor } from "../_components/InvestorIdentity";

/** Loads the connected identity's slice of every series (holdings, schedule, actions, entitlements). */
export function usePortalRows(): {
  rows: SeriesRow[] | null;
  error: string | null;
  reload: () => void;
} {
  const { owner } = useInvestor();
  const [rows, setRows] = useState<SeriesRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    setRows(null);
    setError(null);
    loadPortal(owner)
      .then((r) => live && setRows(r))
      .catch(
        (e: unknown) =>
          live && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      live = false;
    };
  }, [owner, nonce]);

  return { rows, error, reload: () => setNonce((n) => n + 1) };
}
