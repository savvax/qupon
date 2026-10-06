import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the `kase` feature (platform v2), task 1003:
 * schedule check on the demo actions (fixation vs record date) and the
 * SIMULATED disclosure submission. The PDAs mirror mocks/api.ts.
 */
const INTR_MATCH = "ActnINTR0001Dem0PDA111111111111111111111111111";
const INTR_OFF = "ActnINTR0003Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/actions\/([^/]+)\/kase-check$/,
    reply: (match) => {
      const pda = match[1]!;
      const base = { actionPda: pda, match: false, stale: false };
      if (pda === INTR_MATCH)
        return {
          ...base,
          status: "ok",
          ticker: "QPNb1",
          recordDate: "2027-02-28",
          kaseFixation: "2027-02-28",
          period: { start: "2026-09-01", end: "2027-02-28" },
          kasePeriod: {
            recordDate: "2027-02-28",
            start: "2026-09-01",
            end: "2027-02-28",
            rate: 1000,
          },
          match: true,
          fetchedAt: "2026-10-06T08:00:00Z",
        };
      if (pda === INTR_OFF)
        return {
          ...base,
          status: "ok",
          ticker: "BTRKdemo",
          recordDate: "2026-09-28",
          kaseFixation: "2026-09-27",
          period: { start: "2026-03-15", end: "2026-09-15" },
          kasePeriod: {
            recordDate: "2026-09-27",
            start: "2026-03-15",
            end: "2026-09-15",
            rate: 1595,
          },
          match: false,
          fetchedAt: "2026-10-06T08:00:00Z",
        };
      // BMET and everything else: nothing to compare
      return { ...base, status: pda === BMET ? "no_period" : "no_ticker" };
    },
  },
  {
    // SIMULATED: audit-row only, nothing is sent to kase.kz
    method: "POST",
    path: /^\/registrar\/actions\/([^/]+)\/disclosure\/submit$/,
    reply: (match) => ({ ok: true, simulated: true, actionPda: match[1] }),
  },
];
