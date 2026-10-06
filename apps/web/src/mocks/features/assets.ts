import type { MockHandler } from "./types";

/**
 * Mock-mode cash-asset registry (task 601 routes). In-memory and mutable so
 * the e2e can add → enable an asset and see the table change. Authority
 * warnings mirror internal/api/assets.go: added assets come back disabled
 * with freeze/mint-authority warnings, never silently enabled.
 */

const SPL = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Sss6tV2PfXpf9";
const TOKEN22 = "TokenzQdBNbLqP5VEhdkAS6EPFLC1FHJV9V8h9xGQPb4b";

const nowSec = () => Math.floor(Date.now() / 1000);

type Asset = {
  network: string;
  mint: string;
  symbol: string;
  name: string;
  decimals: number;
  tokenProgram: string;
  kind: string;
  issuerNote: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  verifiedAt: number | null;
  enabled: boolean;
  createdAt: number;
};

const asset = (a: Partial<Asset> & { mint: string }): Asset => ({
  network: "devnet",
  symbol: "",
  name: "",
  decimals: 2,
  tokenProgram: SPL,
  kind: "spl",
  issuerNote: "",
  mintAuthority: null,
  freezeAuthority: null,
  verifiedAt: nowSec(),
  enabled: false,
  createdAt: nowSec(),
  ...a,
});

const CUSTODIAN = "CzustoD1anWa11etAddre55555555555555555555555555";

const assets: Asset[] = [
  asset({
    mint: "BYPKzbKvf1up8iJSjx21gS87YwzLKH7gdq5uLJUHZia4",
    symbol: "tKZT",
    name: "Test tenge",
    kind: "test",
  }),
  asset({
    mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU",
    symbol: "USDC",
    name: "USD Coin (Circle devnet)",
    decimals: 6,
    tokenProgram: TOKEN22,
    kind: "stablecoin",
    enabled: true,
  }),
  asset({
    mint: "dKZTCbdcMint1111111111111111111111111111111",
    symbol: "dKZT",
    name: "Digital tenge (custodian-wrapped, SIMULATED)",
    kind: "wrapped_cbdc",
    // SIMULATED custodian keeps the mint authority to wrap/burn.
    mintAuthority: CUSTODIAN,
    enabled: true,
  }),
  asset({
    mint: "KZTEDevEvoStandinMint1111111111111111111111",
    symbol: "KZTE-dev",
    name: "Evo tenge (devnet stand-in)",
    kind: "stablecoin",
    freezeAuthority: CUSTODIAN,
  }),
];

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Same warnings as internal/api/assets.go: live authorities + symbol collisions. */
function warnings(a: Asset): string[] {
  const w: string[] = [];
  if (a.freezeAuthority) w.push("freeze_authority");
  if (a.mintAuthority) w.push("mint_authority");
  if (
    a.symbol &&
    assets.some((o) => o.mint !== a.mint && o.symbol === a.symbol)
  )
    w.push("symbol_collision");
  return w;
}

export const handlers: MockHandler[] = [
  // GET /assets — public: enabled assets of this network, verified fields only.
  {
    method: "GET",
    path: /^\/assets$/,
    reply: () =>
      assets
        .filter((a) => a.enabled)
        .map(
          ({
            mint,
            symbol,
            name,
            decimals,
            kind,
            tokenProgram,
            freezeAuthority,
            mintAuthority,
          }) => ({
            mint,
            symbol,
            name,
            decimals,
            kind,
            tokenProgram,
            freezeAuthority,
            mintAuthority,
          }),
        ),
  },
  {
    method: "GET",
    path: /^\/admin\/assets$/,
    reply: () => assets,
  },
  // POST /admin/assets {mint} — "verified" on-chain: stored disabled with authorities.
  {
    method: "POST",
    path: /^\/admin\/assets$/,
    reply: (_m, body) => {
      const mint = String((body as { mint?: string }).mint ?? "").trim();
      if (!BASE58.test(mint)) return { code: "invalid_params", message: "" };
      if (assets.some((a) => a.mint === mint))
        return { code: "asset_exists", message: "" };
      const a = asset({
        mint,
        // Devnet stand-ins are minted with authorities still live — the case
        // the admin must consciously accept (Review Focus).
        mintAuthority: CUSTODIAN,
        freezeAuthority: CUSTODIAN,
      });
      assets.push(a);
      return { asset: a, warnings: warnings(a) };
    },
  },
  {
    method: "PATCH",
    path: /^\/admin\/assets\/([1-9A-HJ-NP-Za-km-z]{32,44})$/,
    reply: (m, body) => {
      const a = assets.find((x) => x.mint === m[1]);
      if (!a) return { code: "not_found", message: "" };
      const req = body as {
        symbol?: string;
        name?: string;
        kind?: string;
        issuerNote?: string;
        enabled?: boolean;
        acceptFreezeAuthority?: boolean;
      };
      // Mirrors internal/api/assets.go: enabling a freezable mint demands an
      // explicit confirmation (task 9700).
      if (
        req.enabled === true &&
        a.freezeAuthority &&
        req.acceptFreezeAuthority !== true
      ) {
        return { code: "freeze_authority_unconfirmed", message: "" };
      }
      if (req.symbol !== undefined) a.symbol = req.symbol.trim();
      if (req.name !== undefined) a.name = req.name;
      if (req.kind !== undefined) a.kind = req.kind;
      if (req.issuerNote !== undefined) a.issuerNote = req.issuerNote;
      if (req.enabled !== undefined) a.enabled = req.enabled;
      return { asset: a, warnings: warnings(a) };
    },
  },
];
