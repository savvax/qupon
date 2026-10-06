import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
import { NAMESPACES } from "./request";

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
const nsEn = "en";
const nsRu = "ru";
const fullEn: Record<string, unknown> = { ...en, ...byNs(nsEn) };
const fullRu: Record<string, unknown> = { ...ru, ...byNs(nsRu) };

const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`],
  );
describe("messages", () => {
  it("every namespace file exists in both locales and nothing else", () => {
    expect(Object.keys(byNs(nsEn)).sort()).toEqual([...NAMESPACES].sort());
    expect(Object.keys(byNs(nsRu)).sort()).toEqual([...NAMESPACES].sort());
  });
  it("namespace files do not shadow base namespaces", () => {
    for (const ns of NAMESPACES) expect(Object.keys(en)).not.toContain(ns);
  });
  it("EN and RU have identical keys", () => {
    expect(keys(fullRu).sort()).toEqual(keys(fullEn).sort());
  });
  it("no empty strings", () => {
    for (const [name, m] of [
      ["en", fullEn],
      ["ru", fullRu],
    ] as const)
      for (const k of keys(m))
        expect(
          k
            .split(".")
            .reduce<unknown>((o, x) => (o as Record<string, unknown>)[x], m),
          `${name}:${k}`,
        ).not.toBe("");
  });
});
