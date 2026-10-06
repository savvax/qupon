import type { MockHandler } from "./types";

/**
 * Mock-mode fixture for the EXPERIMENTAL term-sheet import (task 042): any
 * pasted text answers the BTRKb33 listing parse through the SIMULATED regex
 * source (docs/research/01-market-kase-iso20022-prior-art.md figures).
 */
const high = <T>(value: T) => ({ value, confidence: "high" as const });

export const BTRK_PARSE = {
  source: "regex",
  simulated: true,
  terms: {
    isin: high("KZ2C00018703"),
    ticker: { value: "BTRKb33", confidence: "medium" },
    issuerName: {
      value: "National Managing Holding Baiterek JSC",
      confidence: "medium",
    },
    faceValue: high(100000),
    currency: high("KZT"),
    couponBps: high(1595),
    frequency: high(2),
    dayCount: high("THIRTY_360"),
    issueDate: high("2026-07-03"),
    maturityDate: high("2031-07-03"),
  },
};

export const handlers: MockHandler[] = [
  {
    method: "POST",
    path: /^\/issuer\/import\/termsheet$/,
    reply: () => BTRK_PARSE, // the dialog refuses empty text before calling
  },
];
