/**
 * Regenerate the typed @solana/kit client into src/generated from the Anchor IDL
 * produced by `anchor build`. Never hand-edit src/generated (AGENTS.md).
 * Usage: pnpm codama   (from clients/ts; run `anchor build` at the repo root first)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { rootNodeFromAnchor } from "@codama/nodes-from-anchor";
import { renderVisitor } from "@codama/renderers-js";
import { visit } from "codama";

const idlPath = resolve(import.meta.dirname, "..", "..", "..", "target", "idl", "qupon_bonds.json");
const idl = JSON.parse(readFileSync(idlPath, "utf8")) as Parameters<typeof rootNodeFromAnchor>[0];

const root = rootNodeFromAnchor(idl);
// formatCode: false — no prettier dependency, byte-deterministic output for the CI drift check.
await visit(
  root,
  // renderVisitor takes the package root and always writes into its src/generated.
  renderVisitor(resolve(import.meta.dirname, ".."), {
    formatCode: false,
    importExtension: "js", // NodeNext ESM resolution needs explicit .js on relative imports
    // syncPackageJson stays on: generated builders import @solana/program-client-core (not re-exported by kit 8).
  }),
);
console.error(`codama: generated src/generated from ${idlPath}`);
