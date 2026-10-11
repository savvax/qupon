/**
 * Child process spawned by config.test.ts for the updateConfig concurrency
 * test: after a random 0–50 ms delay (the gap between a command's read-intent
 * and its write), adds one distinct `series.<name>` entry through the locked
 * updateConfig. Usage: `tsx configLockChild.ts <config-path> <series-name>`.
 */
import { updateConfig } from "./config.js";

const [cfgPath, name] = process.argv.slice(2);
if (cfgPath === undefined || name === undefined) {
  console.error("usage: configLockChild.ts <config-path> <series-name>");
  process.exit(2);
}
setTimeout(() => {
  updateConfig(cfgPath, c => {
    const series = (c.series ?? {}) as Record<string, Record<string, unknown>>;
    series[name] = { ...(series[name] ?? {}), mint: name };
    c.series = series;
  });
}, Math.random() * 50);
