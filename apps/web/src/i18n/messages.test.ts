import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";
import { LOCALES, NAMESPACES } from "./request";

const dir = (loc: string) => join(__dirname, "../../messages", loc);
const byNs = (loc: string): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    (existsSync(dir(loc)) ? readdirSync(dir(loc)) : []) // messages/kk/ lands with task 1505
      .filter((f) => f.endsWith(".json"))
      .map((f) => [
        f.slice(0, -5),
        JSON.parse(readFileSync(join(dir(loc), f), "utf8")),
      ]),
  );
const BASE: Record<string, Record<string, unknown>> = { en, ru, kk };

/**
 * kk namespace files land in task 1505: namespaces still listed here fall back to the EN file
 * (same as loadMessages). An entry whose kk file already exists fails, so empty the list as 1505
 * lands files — after 1505 the list must be empty.
 */
const KK_PENDING = new Set<string>([...NAMESPACES]);
for (const ns of NAMESPACES) {
  const has = existsSync(join(dir("kk"), `${ns}.json`));
  if (KK_PENDING.has(ns) && has)
    throw new Error(
      `messages/kk/${ns}.json exists but is still in KK_PENDING — remove the entry`,
    );
  if (!KK_PENDING.has(ns) && !has)
    throw new Error(
      `messages/kk/${ns}.json is missing but not listed in KK_PENDING`,
    );
}

/** A locale's effective messages: its base file + every namespace file (kk: EN for pending ones). */
function full(loc: string): Record<string, unknown> {
  const nsFiles = byNs(loc);
  const parts = Object.fromEntries(
    NAMESPACES.map((ns) => [
      ns,
      nsFiles[ns] ??
        (loc === "kk" && KK_PENDING.has(ns) ? byNs("en")[ns] : undefined),
    ]),
  );
  return { ...BASE[loc], ...parts };
}

const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`],
  );

describe("messages", () => {
  it("every namespace file exists in en/ru and nothing else", () => {
    for (const loc of ["en", "ru"] as const)
      expect(Object.keys(byNs(loc)).sort()).toEqual([...NAMESPACES].sort());
    // kk namespace files arrive with task 1505; until then only files for done namespaces exist
    expect(Object.keys(byNs("kk")).sort()).toEqual([]);
  });

  it("namespace files do not shadow base namespaces", () => {
    for (const ns of NAMESPACES) expect(Object.keys(en)).not.toContain(ns);
  });

  it("all locales have identical keys", () => {
    const ref = keys(full("en")).sort();
    for (const loc of LOCALES) expect(keys(full(loc)).sort()).toEqual(ref);
  });

  it("no empty strings", () => {
    for (const loc of LOCALES) {
      const m = full(loc);
      for (const k of keys(m))
        expect(
          k
            .split(".")
            .reduce<unknown>((o, x) => (o as Record<string, unknown>)[x], m),
          `${loc}:${k}`,
        ).not.toBe("");
    }
  });
});
