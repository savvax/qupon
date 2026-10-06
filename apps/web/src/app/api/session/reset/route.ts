import { NextResponse } from "next/server";
import { mockAuthReset } from "@/mocks/features/admin";
import { MOCK_SESSIONS, apiBase, sameOrigin } from "@/lib/session";

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/**
 * Public password reset (platform v2 §5.3): consumes the one-time token via
 * POST /auth/reset. No session is created — the user signs in afterwards.
 */
export async function POST(req: Request) {
  if (!(await sameOrigin(req.headers.get("origin"))))
    return err(403, "bad_origin", "bad origin");
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const token = body.token ?? "";
  const password = body.password ?? "";
  if (MOCK_SESSIONS) {
    const r = mockAuthReset(token, password);
    if ("ok" in r) return new NextResponse(null, { status: 204 });
    return err(r.code === "invalid_token" ? 400 : 400, r.code, "");
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/auth/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  } catch {
    return err(502, "upstream", "registrar API unreachable");
  }
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return NextResponse.json(data, { status: res.status });
}
