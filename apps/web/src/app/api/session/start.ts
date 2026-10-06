import { NextResponse } from "next/server";
import {
  MOCK_SESSIONS,
  apiBase,
  mockUser,
  sameOrigin,
  sessionCookie,
} from "@/lib/session";

/** Exchange credentials (or a demo role) for a session: the token goes into the httpOnly cookie, never the body. */
export async function startSession(
  req: Request,
  upstream:
    | "/auth/login"
    | "/auth/demo"
    | "/auth/signup"
    | "/auth/invite/accept",
) {
  if (!(await sameOrigin(req.headers.get("origin"))))
    return NextResponse.json(
      { code: "bad_origin", message: "bad origin" },
      { status: 403 },
    );
  const body = await req.text();

  if (MOCK_SESSIONS && upstream === "/auth/invite/accept") {
    // mock mode: any well-formed invite token joins as the demo issuer ("used" stands in for a spent one)
    const b = JSON.parse(body || "{}") as { token?: string; password?: string };
    const fail = (status: number, code: string) =>
      NextResponse.json({ code, message: code }, { status });
    if (!(b.token ?? "")) return fail(400, "invalid_params");
    if ((b.password ?? "").length < 10) return fail(400, "weak_password");
    if (b.token === "used") return fail(400, "invalid_token");
    const res = NextResponse.json({ user: mockUser("mock:issuer") });
    res.cookies.set(sessionCookie("mock:issuer"));
    return res;
  }
  if (MOCK_SESSIONS && upstream === "/auth/signup") {
    // mock mode mirrors the API's checks the e2e relies on, then signs in as the self-registered investor
    const b = JSON.parse(body || "{}") as { email?: string; password?: string };
    const fail = (status: number, code: string) =>
      NextResponse.json({ code, message: code }, { status });
    if ((b.password ?? "").length < 10) return fail(400, "weak_password");
    if (b.email?.trim().toLowerCase() === "member@qupon.test")
      return fail(409, "email_taken");
    const res = NextResponse.json({ user: mockUser("mock:member") });
    res.cookies.set(sessionCookie("mock:member"));
    return res;
  }
  if (MOCK_SESSIONS) {
    const role =
      upstream === "/auth/demo"
        ? (JSON.parse(body || "{}") as { role?: string }).role
        : "";
    const user = mockUser(`mock:${role}`);
    if (!user)
      return NextResponse.json(
        { code: "bad_credentials", message: "mock mode: use the demo sign-in" },
        { status: upstream === "/auth/demo" ? 400 : 401 },
      );
    const res = NextResponse.json({ user });
    res.cookies.set(sessionCookie(`mock:${role}`));
    return res;
  }
  let up: Response;
  try {
    up = await fetch(`${apiBase()}${upstream}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
  } catch {
    return NextResponse.json(
      { code: "upstream", message: "registrar API unreachable" },
      { status: 502 },
    );
  }
  const data = (await up.json().catch(() => ({}))) as {
    token?: string;
    user?: unknown;
  };
  if (!up.ok || !data.token)
    return NextResponse.json(data, { status: up.ok ? 502 : up.status });
  const res = NextResponse.json({ user: data.user });
  res.cookies.set(sessionCookie(data.token));
  return res;
}
