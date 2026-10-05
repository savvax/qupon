import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The portal builds cast_vote/subscribe with the Kit generated client that
  // lives as TypeScript source in clients/ts — compile it from source. Its
  // NodeNext-style imports use ".js" suffixes; teach webpack to resolve them
  // to the neighbouring .ts files.
  transpilePackages: ["@qupon/client"],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // This repo runs inside a git worktree with its own pnpm-lock.yaml; pin the
  // workspace root here so Next stops guessing.
  outputFileTracingRoot: dirname(dirname(fileURLToPath(import.meta.url))),
};

export default nextConfig;
