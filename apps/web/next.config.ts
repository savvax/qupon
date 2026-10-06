import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // The portal builds cast_vote/subscribe with the Kit generated client that
  // lives as TypeScript source in clients/ts — compile it from source. Its
  // NodeNext-style imports use ".js" suffixes; teach webpack to resolve them
  // to the neighbouring .ts files.
  transpilePackages: ["@qupon/client"],
  // Self-contained server bundle for the VPS image (apps/web/Dockerfile).
  output: "standalone",
  // No x-powered-by header on the public site.
  poweredByHeader: false,
  // The dev-tools bubble is English-only and reviewers took it for part of the product (spec §5.8).
  devIndicators: false,
  // The prototype's console and portal live on in the new cabinets; old links (README, reports, bookmarks) still land.
  async redirects() {
    return [
      { source: "/console", destination: "/registrar", permanent: true },
      { source: "/series/:mint", destination: "/bonds/:mint", permanent: true },
      {
        source: "/actions/:pda",
        destination: "/registrar/actions/:pda",
        permanent: true,
      },
      { source: "/portal", destination: "/investor", permanent: true },
      { source: "/kitchen-sink", destination: "/ui", permanent: true },
    ];
  },
  // Dev only: Next 15 replays cached fetch responses across refreshes, so the console's router.refresh() after a
  // step kept showing the pre-step status. Production never caches these (force-dynamic + no-store).
  experimental: { serverComponentsHmrCache: false },
  webpack: (
    config: Parameters<NonNullable<Required<NextConfig>["webpack"]>>[0],
  ) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
  // This repo runs inside a git worktree with its own pnpm-lock.yaml; pin the
  // workspace root here so Next stops guessing.
  outputFileTracingRoot: dirname(
    dirname(dirname(fileURLToPath(import.meta.url))),
  ), // repo root (apps/web/../..)
};

// next-intl: locale from the NEXT_LOCALE cookie (no i18n routing) — see src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
