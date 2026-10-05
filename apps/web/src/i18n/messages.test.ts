import { describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import ru from "../../messages/ru.json";
const keys = (o: Record<string, unknown>, p = ""): string[] =>
  Object.entries(o).flatMap(([k, v]) =>
    v && typeof v === "object"
      ? keys(v as Record<string, unknown>, `${p}${k}.`)
      : [`${p}${k}`],
  );
describe("messages", () => {
  it("EN and RU have identical keys", () => {
    expect(keys(ru).sort()).toEqual(keys(en).sort());
  });
  it("no empty strings", () => {
    for (const [name, m] of [
      ["en", en],
      ["ru", ru],
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
