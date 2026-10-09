import { NextResponse } from "next/server";
import { mockGet } from "@/mocks/api";
import { MOCK_SESSIONS, apiBase, sessionToken } from "@/lib/session";
import { isAllowedRead, isPublicRead } from "../../bo/allowlist";

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/**
 * Session proxy for downloads (CSV reports, documents): streams the body with its type and filename. The sandbox
 * read (isPublicRead) needs no session: the sandbox page polls it (mock mode keeps one in-process state this way).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  const pub = isPublicRead(path);
  if (!isAllowedRead(path) && !pub)
    return err(403, "forbidden_path", "not allowed");
  const token = await sessionToken();
  if (!token && !pub) return err(401, "unauthenticated", "sign in required");
  const search = pub ? "" : new URL(req.url).search;
  if (MOCK_SESSIONS) {
    // a mock may throw synchronously: run it inside the promise chain so every miss is a 404
    const value = await Promise.resolve()
      .then(() => mockGet(`/${path}${search}`))
      .catch(() => null);
    if (value === null) return err(404, "not_found", "not found");
    return typeof value === "string"
      ? new NextResponse(value, {
          headers: { "Content-Type": "text/csv; charset=utf-8" },
        })
      : NextResponse.json(value);
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}${search}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: "no-store",
    });
  } catch {
    return err(502, "upstream", "registrar API unreachable");
  }
  const headers = new Headers({
    "Content-Type":
      res.headers.get("Content-Type") ?? "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  });
  const cd = res.headers.get("Content-Disposition");
  if (cd) headers.set("Content-Disposition", cd);
  return new NextResponse(res.body, { status: res.status, headers });
}
