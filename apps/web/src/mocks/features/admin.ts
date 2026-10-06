import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the `admin` feature (platform v2): overview + system
 * health (task 705). Users/series rows mirror internal/api/admin.go DTOs; the
 * system payload mirrors internal/api/system.go, including a low-balance
 * paying-agent wallet so the warning state is visible (spec §5.2).
 */

const nowSec = () => Math.floor(Date.now() / 1000);

const REGISTRAR = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
const ISSUER = "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma";
const PAYING_AGENT = "7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk";

const users = [
  {
    id: 1,
    email: "admin@qupon.test",
    name: "Ada Admin",
    role: "admin",
    isDemo: false,
    orgId: null,
    status: "active",
    locale: "en",
  },
  {
    id: 2,
    email: "kassa@demo-issuer.kz",
    name: "Demo Issuer",
    role: "issuer",
    isDemo: true,
    orgId: 1,
    status: "active",
    locale: "en",
  },
  {
    id: 3,
    email: "issuer@halyk.kz",
    name: "Halyk issuer",
    role: "issuer",
    isDemo: false,
    orgId: 1,
    status: "active",
    locale: "ru",
  },
  {
    id: 4,
    email: "registrar@qupon.test",
    name: "Reg Registrar",
    role: "registrar",
    isDemo: false,
    orgId: 2,
    status: "active",
    locale: "en",
  },
  {
    id: 5,
    email: "mira@qupon.test",
    name: "Mira Member",
    role: "investor",
    isDemo: false,
    orgId: null,
    status: "active",
    locale: "en",
  },
  {
    id: 6,
    email: "investor@demo.kz",
    name: "Demo Investor",
    role: "investor_demo",
    isDemo: true,
    orgId: null,
    status: "active",
    locale: "ru",
  },
  {
    id: 7,
    email: "blocked@qupon.test",
    name: "Blocked User",
    role: "investor",
    isDemo: false,
    orgId: null,
    status: "disabled",
    locale: "en",
  },
];

const series = [
  {
    mint: "QpNb1Dem0BondMint1111111111111111111111111111",
    pda: "SeRiesDem0PDA111111111111111111111111111111",
    ticker: "QPNb1",
    isin: "KZ2C0QUPON01",
    hidden: false,
    featured: true,
    kaseTicker: "",
    orgId: 1,
    updatedAt: nowSec() - 3_600,
  },
  {
    mint: "BTRKDeM0BondMint1111111111111111111111111111",
    pda: "SeRiesDem0PDAB11111111111111111111111111111",
    ticker: "BTRKdemo",
    isin: "KZ2C00018703",
    hidden: false,
    featured: false,
    kaseTicker: "BTRKb33",
    orgId: 1,
    updatedAt: nowSec() - 86_400,
  },
];

const system = {
  network: "devnet",
  rpc: { ok: true, latencyMs: 142, slot: 288_123_456 },
  operators: [
    { name: "registrar", address: REGISTRAR, sol: 4.213, low: false },
    { name: "issuer", address: ISSUER, sol: 1.872, low: false },
    // Under the 0.5 SOL threshold (internal/api/system.go lowSolThreshold).
    { name: "payingAgent", address: PAYING_AGENT, sol: 0.312, low: true },
  ],
  executor: { running: 0, queued: 1, maxConcurrent: 4 },
  scheduler: {
    enabled: true,
    lastTick: new Date(Date.now() - 30_000).toISOString(),
  },
  ingest: { lastSlot: 288_123_448, lagSlots: 8 },
  kase: { entries: 5, lastFetch: new Date(Date.now() - 600_000).toISOString() },
  demo: { writesPerHour: 2, seriesPerDay: 1 },
};

export const handlers: MockHandler[] = [
  { method: "GET", path: /^\/admin\/users$/, reply: () => ({ users }) },
  { method: "GET", path: /^\/admin\/series$/, reply: () => ({ series }) },
  { method: "GET", path: /^\/admin\/system$/, reply: () => system },
];
