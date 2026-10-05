/**
 * Print config/devnet.json extended with every Series account on chain (name = on-chain ticker), so a deployed
 * registrar executor can resolve any demo series by mint. Used by ops/deploy-vps.sh; reads only.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Address, getBase58Decoder } from "@solana/kit";
import { SERIES_DISCRIMINATOR, getSeriesDecoder } from "../src/generated/index.js";
import { createRpc, loadEnvFile } from "../src/lib/tx.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
loadEnvFile();
const base = JSON.parse(readFileSync(join(root, "config/devnet.json"), "utf8")) as {
  programId: Address;
  series: Record<string, Record<string, unknown>>;
};
const accounts = await createRpc()
  .getProgramAccounts(base.programId, {
    encoding: "base64",
    filters: [{ memcmp: { offset: 0n, bytes: getBase58Decoder().decode(SERIES_DISCRIMINATOR), encoding: "base58" } }],
  })
  .send();
const decoder = getSeriesDecoder();
const series = { ...base.series };
for (const { account } of accounts) {
  const s = decoder.decode(Buffer.from(account.data[0], "base64"));
  const name = new TextDecoder().decode(s.ticker).replace(/\0+$/, "");
  const template = base.series[name.startsWith("BTRK") ? "BTRKdemo" : "QPNb1"] ?? {};
  if (!(name in series)) series[name] = { ...template, mint: s.mint, cashMint: s.cashMint };
}
console.log(JSON.stringify({ ...base, series }, null, 2));
