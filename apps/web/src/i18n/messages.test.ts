import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import kk from "../../messages/kk.json";
import { LOCALES, NAMESPACES } from "./request";

const dir = (loc: string) => join(__dirname, "../../messages", loc);
const byNs = (loc: string): Record<string, Record<string, unknown>> =>
  Object.fromEntries(
    readdirSync(dir(loc))
      .filter((f) => f.endsWith(".json"))
      .map((f) => [
        f.slice(0, -5),
        JSON.parse(readFileSync(join(dir(loc), f), "utf8")),
      ]),
  );
const BASE: Record<string, Record<string, unknown>> = { en, ru, kk };

/** A locale's full messages: its base file plus every namespace file, with no fallback. */
function full(loc: string): Record<string, unknown> {
  return { ...BASE[loc], ...byNs(loc) };
}

const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`],
  );

describe("messages", () => {
  it("every namespace file exists in every locale and nothing else", () => {
    for (const loc of LOCALES)
      expect(Object.keys(byNs(loc)).sort()).toEqual([...NAMESPACES].sort());
  });

  it("namespace files do not shadow base namespaces", () => {
    for (const ns of NAMESPACES) expect(Object.keys(en)).not.toContain(ns);
  });

  it("all locales have identical keys, base file included", () => {
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
