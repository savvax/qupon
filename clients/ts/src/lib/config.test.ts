import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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
    updateConfig(file, c => {
      c.tkztMint = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
    });
    const cfg = loadConfig(file);
    expect(cfg.tkztMint).toBe("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
    expect(cfg.programId).toBe(VALID.programId);
  });

  it("updateConfig survives 8 concurrent writers without losing series entries", async () => {
    const file = tmpConfig(JSON.stringify(VALID));
    const tsxCli = join(dirname(createRequire(import.meta.url).resolve("tsx/package.json")), "dist", "cli.mjs");
    const child = fileURLToPath(new URL("./configLockChild.ts", import.meta.url));
    const names = Array.from({ length: 8 }, (_, i) => `T${i}`);
    const exits = names.map(n =>
      new Promise<number | null>(resolve => {
        const p = spawn(process.execPath, [tsxCli, child, file, n]);
        p.on("close", code => resolve(code));
      }),
    );
    expect(await Promise.all(exits)).toEqual(Array<number>(8).fill(0));
    const cfg = loadConfig(file); // throws if the file is not valid JSON
    for (const n of names) expect(cfg.series[n]?.mint, `series.${n}.mint`).toBe(n);
    expect(readdirSync(dirname(file)).filter(f => f.endsWith(".lock") || f.endsWith(".tmp"))).toEqual([]);
    expect(existsSync(`${file}.lock`)).toBe(false);
  }, 60_000);

  it("updateConfig breaks a stale lock (mtime > 60 s) and proceeds", () => {
    const file = tmpConfig(JSON.stringify(VALID));
    const lock = `${file}.lock`;
    writeFileSync(lock, "12345\n");
    const old = new Date(Date.now() - 120_000);
    utimesSync(lock, old, old);
    updateConfig(file, c => {
      c.tkztMint = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
    });
    expect(loadConfig(file).tkztMint).toBe("Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97");
    expect(existsSync(lock)).toBe(false);
  });

  it("loadConfig fails with a clear message on a missing file", () => {
    expect(() => loadConfig("/nonexistent/qupon/devnet.json")).toThrow(/cannot read config/);
  });
});
