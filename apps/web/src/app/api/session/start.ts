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
  upstream: "/auth/login" | "/auth/demo",
) {
  if (!(await sameOrigin(req.headers.get("origin"))))
    return NextResponse.json(
      { code: "bad_origin", message: "bad origin" },
      { status: 403 },
    );
  const body = await req.text();
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
