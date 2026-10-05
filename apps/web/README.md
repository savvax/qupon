# Qupon Web — Registrar Console

Next.js 15 (app router, TS strict) + Tailwind. Registrar console for the
qupon_bonds corporate-actions engine on Solana devnet.

## Environment

| Variable | Default | Purpose |
|---|---|---|
| `API_URL` | `http://localhost:8080` | Go registrar service base URL (server-side) |
| `API_MOCKING` | `enabled` in dev | `disabled` = use the real registrar API |
| `NEXT_PUBLIC_RPC_URL` | `https://api.devnet.solana.com` | wallet-adapter cluster endpoint |

Copy `.env.example` to `.env.local` (git-ignored) and adjust.

## Development

`pnpm dev` starts on `http://localhost:3000`. Until the Go registrar is
running (`make api` from the repo root), a fixture mock (`src/mocks/api.ts`)
serves the read endpoints of `services/registrar/openapi.yaml` inside the
typed client with demo fixtures (QPNb1 1,000 KZT face, 10% semi-annual,
holders 10/25/65 units; BTRKdemo in USDC); it logs a warning on first use.
An HTTP-level mock (MSW/Prism) was tried and dropped: the bundler cannot
resolve `msw/node`'s deep subpath imports and Next's patched `fetch` escapes
interception. Set `API_MOCKING=disabled` + `API_URL` to use the real service.

Wallets: Phantom, Backpack and Solflare connect via the Wallet Standard —
no explicit adapters needed.

## Scripts

- `pnpm dev` / `build` / `start` — Next.js
- `pnpm gen` — regenerate `src/lib/api-schema.d.ts` from
  `services/registrar/openapi.yaml` (openapi-typescript; never hand-edit)
- `pnpm typecheck` / `lint` / `test` — gate used by `make verify`

## Layout

- `src/lib/api.ts` — typed fetchers (`listSeries`, `getSeries`,
  `listInvestors`, `getSchedule`, `listActions`) with `ApiError`
- `src/lib/format.ts` — pubkey/date/amount/bps formatters (vitest-covered)
- `src/components/ui/*` — StatusChip, ExplorerLink, SimulatedBadge,
  AmountCell, Timeline (minimal stubs; task 050 replaces them, props stay)
- `src/app/page.tsx` — series list · `src/app/series/[mint]` — terms,
  schedule, holders, actions
- `src/mocks/api.ts` — dev-only fixture mock routed inside `lib/api.ts`
