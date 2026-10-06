import type { MockHandler } from "./types";

/**
 * Mock-mode fixtures for the `admin` feature (platform v2): overview + system
 * health (task 705), and the users / organisations / reset-link routes of task
 * 701 mirrored for the pages of task 703. Users and orgs are mutable so the
 * e2e can create → edit → disable and see the table change; reset tokens are
 * single use like internal/store/admin.go.
 */

const nowSec = () => Math.floor(Date.now() / 1000);

const REGISTRAR = "Bnq22GvV6AQcXWeTp6x3uTYkC7HKKrysiFve2uCDqE97";
const ISSUER = "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma";
const PAYING_AGENT = "7EiXu2LfAk6WiCE5ZfF2kc4Sk3cP9GubmQ4V9R4smijk";

/** Same shape as internal/api/auth.go userDTO. */
type User = {
  id: number;
  email: string;
  name: string;
  role: string;
  isDemo: boolean;
  orgId: number | null;
  status: string;
  locale: string;
};

let nextUserId = 100;
const users: User[] = [
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

/** Same shape as internal/store/organizations.go Organization. */
type Org = {
  id: number;
  name: string;
  kind: string;
  bin: string;
  website: string;
  createdAt: number;
};

let nextOrgId = 100;
const orgs: Org[] = [
  {
    id: 1,
    name: "Demo Issuer Ltd",
    kind: "issuer",
    bin: "123456789012",
    website: "https://demo-issuer.kz",
    createdAt: nowSec() - 30 * 86_400,
  },
  {
    id: 2,
    name: "Qupon Registrar",
    kind: "registrar",
    bin: "",
    website: "https://qupon.85-192-29-7.sslip.io",
    createdAt: nowSec() - 60 * 86_400,
  },
];

/** One-time reset tokens: base64url random, 24 h, consumed on use (task 701). */
const resetTokens = new Map<string, { userId: number; expiresAt: number }>();
const RESET_TTL_MS = 24 * 3_600_000;

const randomToken = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().replace(/-/g, "")
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** POST /auth/reset for the /api/session/reset proxy (mock mode): single use, 24 h. */
export function mockAuthReset(
  token: string,
  password: string,
): { ok: true } | { code: string } {
  if (!token || password.length < 10) return { code: "invalid_params" };
  const entry = resetTokens.get(token);
  if (!entry || entry.expiresAt < Date.now()) return { code: "invalid_token" };
  resetTokens.delete(token);
  return { ok: true };
}

const ROLES = ["issuer", "registrar", "investor", "admin"];
const STATUSES = ["active", "disabled", "pending"];

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

/** Same filtering as store.ListUsers: q over email+name, exact role/status. */
function filterUsers(q: string, role: string, status: string): User[] {
  const needle = q.trim().toLowerCase();
  return users.filter(
    (u) =>
      (!needle ||
        u.email.toLowerCase().includes(needle) ||
        u.name.toLowerCase().includes(needle)) &&
      (!role || u.role === role) &&
      (!status || u.status === status),
  );
}

export const handlers: MockHandler[] = [
  {
    method: "GET",
    path: /^\/admin\/users$/,
    reply: (_m, _b, query) => ({
      users: filterUsers(query.get("q") ?? "", query.get("role") ?? "", query.get("status") ?? ""),
    }),
  },
  // POST /admin/users — same validation as internal/api/admin.go adminCreateUser.
  {
    method: "POST",
    path: /^\/admin\/users$/,
    reply: (_m, body) => {
      const req = body as {
        email?: string;
        name?: string;
        role?: string;
        orgId?: number | null;
        password?: string;
      };
      const email = (req.email ?? "").trim().toLowerCase();
      if (
        !email.includes("@") ||
        !req.name ||
        !ROLES.includes(req.role ?? "") ||
        (req.password ?? "").length < 10
      )
        return { code: "invalid_params", message: "" };
      if (users.some((u) => u.email === email))
        return { code: "email_taken", message: "" };
      if (req.orgId && !orgs.some((o) => o.id === req.orgId))
        return { code: "invalid_params", message: "" };
      const u: User = {
        id: nextUserId++,
        email,
        name: req.name!,
        role: req.role!,
        isDemo: false,
        orgId: req.orgId ?? null,
        status: "active",
        locale: "en",
      };
      users.push(u);
      return { user: u };
    },
  },
  // PATCH /admin/users/{id} — role/org/status/name; orgId 0 clears the org.
  {
    method: "PATCH",
    path: /^\/admin\/users\/(\d+)$/,
    reply: (m, body) => {
      const u = users.find((x) => x.id === Number(m[1]));
      if (!u) return { code: "not_found", message: "" };
      const req = body as {
        role?: string;
        orgId?: number;
        status?: string;
        name?: string;
      };
      if (
        (req.role !== undefined && !ROLES.includes(req.role)) ||
        (req.status !== undefined && !STATUSES.includes(req.status))
      )
        return { code: "invalid_params", message: "" };
      if (req.orgId && !orgs.some((o) => o.id === req.orgId))
        return { code: "invalid_params", message: "" };
      if (req.role !== undefined) u.role = req.role;
      if (req.orgId !== undefined) u.orgId = req.orgId || null;
      if (req.status !== undefined) u.status = req.status;
      if (req.name) u.name = req.name;
      return { user: u };
    },
  },
  // POST /admin/users/{id}/reset-link — one-time token, 24 h, shown once.
  {
    method: "POST",
    path: /^\/admin\/users\/(\d+)\/reset-link$/,
    reply: (m) => {
      const u = users.find((x) => x.id === Number(m[1]));
      if (!u) return { code: "not_found", message: "" };
      const token = randomToken();
      resetTokens.set(token, { userId: u.id, expiresAt: Date.now() + RESET_TTL_MS });
      // Relative URL: the modal absolutises against the current origin (the Go
      // API builds an absolute one from PUBLIC_URL).
      return {
        url: `/reset/${token}`,
        expiresAt: new Date(Date.now() + RESET_TTL_MS).toISOString(),
      };
    },
  },
  {
    method: "GET",
    path: /^\/admin\/organizations$/,
    reply: () => ({ organizations: orgs }),
  },
  // POST /admin/organizations {name, kind, bin?, website?}.
  {
    method: "POST",
    path: /^\/admin\/organizations$/,
    reply: (_m, body) => {
      const req = body as {
        name?: string;
        kind?: string;
        bin?: string;
        website?: string;
      };
      if (!req.name || (req.kind !== "issuer" && req.kind !== "registrar"))
        return { code: "invalid_params", message: "" };
      const org: Org = {
        id: nextOrgId++,
        name: req.name,
        kind: req.kind!,
        bin: req.bin ?? "",
        website: req.website ?? "",
        createdAt: nowSec(),
      };
      orgs.push(org);
      return { organization: org };
    },
  },
  // PATCH /admin/organizations/{id}.
  {
    method: "PATCH",
    path: /^\/admin\/organizations\/(\d+)$/,
    reply: (m, body) => {
      const org = orgs.find((o) => o.id === Number(m[1]));
      if (!org) return { code: "not_found", message: "" };
      const req = body as {
        name?: string;
        kind?: string;
        bin?: string;
        website?: string;
      };
      if (
        (req.kind !== undefined &&
          req.kind !== "issuer" &&
          req.kind !== "registrar") ||
        (req.name !== undefined && !req.name)
      )
        return { code: "invalid_params", message: "" };
      if (req.name !== undefined) org.name = req.name;
      if (req.kind !== undefined) org.kind = req.kind;
      if (req.bin !== undefined) org.bin = req.bin;
      if (req.website !== undefined) org.website = req.website;
      return { organization: org };
    },
  },
  {
    method: "GET",
    path: /^\/admin\/series$/,
    reply: () => ({ series }),
  },
  {
    method: "GET",
    path: /^\/admin\/system$/,
    reply: () => system,
  },
];
