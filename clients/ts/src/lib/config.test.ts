import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig, parseConfig, tkztMintSet, updateConfig } from "./config.js";

const VALID = {
  cluster: "devnet",
  programId: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
  token2022ProgramId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
  tkztMint: "REPLACE_AFTER_create-tkzt",
  series: {},
  wallets: {
    registrar: "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97",
    issuer: "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma",
    payingAgent: "7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk",
    investors: [
      "DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo",
      "7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau",
      "6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cve7BxX5M9rdC",
    ],
    outsider: "EiAZ7r9tVciGeibwdFmjbhhZVeSGXxY2CMuqP71MaN6g",
  },
};

const tmpDirs: string[] = [];
function tmpConfig(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "qupon-config-"));
  tmpDirs.push(dir);
  const file = join(dir, "devnet.json");
  writeFileSync(file, content);
  return file;
}

afterEach(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("config", () => {
  it("parses a valid devnet config from a temp file", () => {
    const file = tmpConfig(JSON.stringify(VALID));
    const cfg = loadConfig(file);
    expect(cfg.wallets.registrar).toBe(VALID.wallets.registrar);
    expect(cfg.wallets.investors).toHaveLength(3);
    expect(cfg.usdcMint).toBe(VALID.usdcMint);
  });

  it("treats a REPLACE_ placeholder as 'mint not created'", () => {
    expect(tkztMintSet(parseConfig(JSON.stringify(VALID)))).toBe(false);
    expect(tkztMintSet(parseConfig(JSON.stringify({ ...VALID, tkztMint: "" })))).toBe(false);
    expect(
      tkztMintSet(parseConfig(JSON.stringify({ ...VALID, tkztMint: "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97" }))),
    ).toBe(true);
  });

  it("rejects invalid JSON and invalid addresses", () => {
    expect(() => parseConfig("{not json")).toThrow(/invalid JSON/);
    expect(() => parseConfig("{}")).toThrow(/missing 'wallets'/);
    expect(() => parseConfig(JSON.stringify({ ...VALID, wallets: { ...VALID.wallets, registrar: "not-a-key" } }))).toThrow(
      /wallets.registrar/,
    );
  });

  it("updateConfig patches one key and keeps the rest", () => {
    const file = tmpConfig(JSON.stringify(VALID));
    updateConfig(file, { tkztMint: "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97" });
    const cfg = loadConfig(file);
    expect(cfg.tkztMint).toBe("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
    expect(cfg.programId).toBe(VALID.programId);
  });

  it("loadConfig fails with a clear message on a missing file", () => {
    expect(() => loadConfig("/nonexistent/qupon/devnet.json")).toThrow(/cannot read config/);
  });
});
