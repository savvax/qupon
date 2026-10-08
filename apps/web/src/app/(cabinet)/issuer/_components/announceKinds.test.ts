import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The issuer announce dialog must not offer PCAL (task 1401): a partial call pays
 * only factor of face while complete_action + retire_batch retire 100% of units.
 * Re-enable only when the program supports pool factors (task 1402).
 * Source contract test (same pattern as i18n/messages.test.ts) — no DOM harness in this suite.
 */
const src = readFileSync(
  fileURLToPath(new URL("./IssuerActions.tsx", import.meta.url)),
  "utf8",
);
// The kind picker: from its label to the MCAL-only callDate field that follows it.
const picker = src.slice(
  src.indexOf('label={t("kind")}'),
  src.indexOf('kind === "MCAL" && ('),
);

describe("announce kind picker excludes PCAL (task 1401)", () => {
  it("offers INTR, REDM and MCAL only", () => {
    for (const kind of ["INTR", "REDM", "MCAL"]) {
      expect(picker).toContain(`value: "${kind}"`);
    }
    expect(picker).not.toContain(`value: "PCAL"`);
  });
});
