import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This repo runs inside a git worktree with its own pnpm-lock.yaml; pin the
  // workspace root here so Next stops guessing.
  outputFileTracingRoot: dirname(dirname(fileURLToPath(import.meta.url))),
};

export default nextConfig;
