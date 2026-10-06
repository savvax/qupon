import type { MockHandler } from "./types";

/** Mock-mode network profile: devnet, demo sign-in on. */
export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/network$/,
    reply: () => ({
      network: "devnet",
      programId: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
      explorerCluster: "devnet",
      mainnet: false,
      demoLogin: true,
    }),
  },
  {
    // The public asset list (GET /assets) travels with the network profile in mock mode.
    method: "GET",
    path: /^\/assets$/,
    reply: () => [
      {
        mint: "tKZTDeM0CashMint1111111111111111111111111111",
        symbol: "tKZT",
        name: "Test tenge (devnet)",
        decimals: 2,
        kind: "test",
        tokenProgram: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      },
      {
        mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
        symbol: "USDC",
        name: "USD Coin (Circle devnet)",
        decimals: 6,
        kind: "stablecoin",
        tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      },
      {
        mint: "KZTEdevMint11111111111111111111111111111111",
        symbol: "KZTE-dev",
        name: "Evo tenge (devnet stand-in)",
        decimals: 2,
        kind: "stablecoin",
        tokenProgram: "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
      },
    ],
    method: "GET",
    path: /^\/admin\/network\/readiness$/,
    reply: () => ({
      network: "devnet",
      programId: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
      mainnet: false,
      checks: [
        { key: "rpc_reachable", ok: true },
        {
          key: "program_deployed",
          ok: true,
          detail: "QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd",
        },
        { key: "program_executable", ok: true },
        {
          key: "upgrade_authority",
          ok: true,
          detail: "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97",
        },
        { key: "cash_assets_enabled", ok: true, detail: "USDC, tKZT" },
        { key: "demo_login", ok: true, detail: "on" },
      ],
    }),
  },
];
