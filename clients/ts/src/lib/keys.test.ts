import { homedir } from "node:os";
import { describe, expect, it } from "vitest";
import { expandHomePath } from "./keys.js";

describe("expandHomePath", () => {
  it("expands leading $HOME", () => {
    expect(expandHomePath("$HOME/.config/qupon/registrar.json")).toBe(`${homedir()}/.config/qupon/registrar.json`);
  });
  it("expands leading ~", () => {
    expect(expandHomePath("~/.config/qupon/issuer.json")).toBe(`${homedir()}/.config/qupon/issuer.json`);
  });
  it("leaves bare $HOME and ~ expanding to homedir", () => {
    expect(expandHomePath("$HOME")).toBe(homedir());
    expect(expandHomePath("~")).toBe(homedir());
  });
  it("leaves absolute and $OTHER paths untouched", () => {
    expect(expandHomePath("/etc/key.json")).toBe("/etc/key.json");
    expect(expandHomePath("$OTHER/key.json")).toBe("$OTHER/key.json");
  });
});
