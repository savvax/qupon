import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { API_BASE_URL, MOCK_ENABLED } from "@/lib/api";

/** httpOnly cookie holding the back-office session token; the browser's JS never sees it. */
export const SESSION_COOKIE = "qupon_session";

export type Role =
  "issuer" | "registrar" | "investor_demo" | "investor" | "admin";
export type SessionUser = {
  id: number;
  email: string;
  name: string;
  role: Role;
  isDemo: boolean;
  orgId?: number | null;
  status?: "active" | "disabled" | "pending";
  locale?: "en" | "ru";
};

export const ROLE_HOME: Record<Role, string> = {
  issuer: "/issuer",
  registrar: "/registrar",
  investor_demo: "/investor",
  investor: "/investor",
  admin: "/admin",
};

/** Server-to-server base URL: inside compose the API is http://registrar:8080. */
export function apiBase(): string {
  return process.env.API_INTERNAL_URL ?? API_BASE_URL;
}

/** Local dev / e2e without the Go API: demo sign-in issues "mock:<role>" tokens and writes succeed fake. */
export const MOCK_SESSIONS =
  process.env.NODE_ENV === "development" && MOCK_ENABLED;

const DEMO_ROLES: Record<string, Role> = {
  issuer: "issuer",
  registrar: "registrar",
  investor: "investor_demo",
};
/** Mock-only accounts for e2e (set the cookie `qupon_session=mock:admin` / `mock:member`): not demo identities. */
const MOCK_ACCOUNTS: Record<string, Role> = {
  admin: "admin",
  member: "investor",
};

export function mockUser(token: string): SessionUser | null {
  const demo = token.startsWith("mock:") ? token.slice(5) : "";
  const role = DEMO_ROLES[demo] ?? MOCK_ACCOUNTS[demo];
  if (!role) return null;
  const isDemo = demo in DEMO_ROLES;
  return {
    id: isDemo ? 1 : 2,
    email: isDemo ? `demo-${demo}@qupon.demo` : `${demo}@qupon.test`,
    name: isDemo
      ? `Demo ${demo}`
      : demo === "admin"
        ? "Ada Admin"
        : "Mira Member",
    role,
    isDemo,
    orgId: role === "issuer" ? 1 : role === "registrar" ? 2 : null,
    status: "active",
    locale: "en",
  };
}

export async function sessionToken(): Promise<string | undefined> {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

/** The signed-in back-office user, or null (no cookie, expired session, API down). Once per request. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await sessionToken();
  if (!token) return null;
  if (MOCK_SESSIONS) return mockUser(token);
  const res = await fetch(`${apiBase()}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  return ((await res.json()) as { user: SessionUser }).user;
});

/** Gate a cabinet page: signed out → /login?next=path; another role → /forbidden. Admins pass. */
export async function requireRole(
  path: string,
  ...roles: Role[]
): Promise<SessionUser> {
  const u = await getSession();
  if (!u) redirect(`/login?next=${encodeURIComponent(path)}`);
  if (u.role !== "admin" && !roles.includes(u.role))
    redirect(`/forbidden?role=${u.role}`);
  return u;
}

export function sessionCookie(token: string) {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

/**
 * CSRF guard for cookie-authenticated POSTs: a browser always sends Origin on cross-site POSTs, so it must
 * match the host we are served on (behind Caddy the Host header is preserved).
 */
export async function sameOrigin(origin: string | null): Promise<boolean> {
  if (!origin) return true;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
