import { describe, expect, it } from "vitest";
import en from "../../messages/en/kit.json";
import kk from "../../messages/kk/kit.json";
import ru from "../../messages/ru/kit.json";
import { GLOSSARY } from "./glossary";

const BY_LOCALE = { en, ru, kk } as Record<
  string,
  { glossary: Record<string, { term: string; def: string }> }
>;

/** The plan's minimum list, matched on the English term. */
const REQUIRED = [
  /record date/i,
  /entitlement/i,
  /ex-date/i,
  /accrued/i,
  /coupon/i,
  /redemption/i,
  /early redemption/i,
  /partial call/i,
  /bondholder meeting/i,
  /quorum/i,
  /escrow/i,
  /paying agent/i,
  /registrar/i,
  /default/i,
  /cure/i,
  /permissionless/i,
  /snapshot hash/i,
  /transfer hook/i,
  /pause/i,
  /dvp/i,
  /sas/i,
  /demo clock/i,
];

describe("glossary", () => {
  it("has at least 20 unique terms", () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(20);
    expect(new Set(GLOSSARY).size).toBe(GLOSSARY.length);
  });

  it("covers every term the plan names", () => {
    const terms = GLOSSARY.map((k) => en.glossary[k].term).join("\n");
    for (const re of REQUIRED) expect(terms, re.source).toMatch(re);
  });

  it("defines exactly these terms in en, ru and kk", () => {
    for (const [loc, m] of Object.entries(BY_LOCALE)) {
      expect(Object.keys(m.glossary).sort(), loc).toEqual([...GLOSSARY].sort());
      for (const k of GLOSSARY) {
        expect(m.glossary[k]?.term, `${loc}:${k}.term`).toBeTruthy();
        expect(m.glossary[k]?.def, `${loc}:${k}.def`).toBeTruthy();
      }
    }
  });
});
