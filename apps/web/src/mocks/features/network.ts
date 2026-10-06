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
];
