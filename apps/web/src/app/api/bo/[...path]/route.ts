import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";
import { featureMock } from "@/mocks/features";
import {
  MOCK_SESSIONS,
  apiBase,
  sameOrigin,
  sessionToken,
} from "@/lib/session";
import { SANDBOX_COOKIE } from "@/lib/sandbox";
import { isAllowedWrite, isPublicWrite } from "../allowlist";

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

type Ctx = { params: Promise<{ path: string[] }> };

/** A created sandbox becomes the visitor's: the cookie lets /sandbox/new resume it. */
function withSandboxCookie(res: NextResponse, path: string, body: unknown) {
  const id = (body as { id?: unknown } | null)?.id;
  if (path === "demo/sandbox" && res.ok && typeof id === "string")
    res.cookies.set({
      name: SANDBOX_COOKIE,
      value: id,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
  return res;
}

/**
 * Session proxy for signed-in writes: JSON only, same origin, bearer from the httpOnly cookie. The sandbox writes
 * (isPublicWrite) need no session; they carry the visitor's address for the registrar's per-visitor rate limit.
 */
async function forward(
  method: "POST" | "PATCH" | "DELETE",
  req: Request,
  { params }: Ctx,
) {
  const path = (await params).path.join("/");
  if (!isAllowedWrite(path)) return err(403, "forbidden_path", "not allowed");
  if (!(await sameOrigin(req.headers.get("origin"))))
    return err(403, "bad_origin", "bad origin");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return err(415, "bad_content_type", "JSON only");
  const pub = method === "POST" && isPublicWrite(path);
  const token = await sessionToken();
  if (!token && !pub) return err(401, "unauthenticated", "sign in required");
  const body = await req.text();
  if (MOCK_SESSIONS) {
    let feature: { value: unknown } | undefined;
    try {
      feature = featureMock(method, `/${path}`, JSON.parse(body || "{}"));
    } catch (e) {
      const x = e as { status?: number; code?: string; message?: string };
      if (!x.status) throw e;
      return err(x.status, x.code ?? `http_${x.status}`, x.message ?? "");
    }
    if (feature)
      return withSandboxCookie(NextResponse.json(feature.value), path, feature.value);
    return NextResponse.json({
      mock: true,
      signatures: [
        "MockSig1111111111111111111111111111111111111111111111111111111111111111111111111111111",
      ],
    });
  }
  const h = await headers();
  const sandbox = (await cookies()).get(SANDBOX_COOKIE)?.value;
  const forwardedFor = h.get("x-forwarded-for") ?? h.get("x-real-ip");
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(pub && forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
        ...(pub && sandbox ? { Cookie: `${SANDBOX_COOKIE}=${sandbox}` } : {}),
        ...(req.headers.get("x-confirm-network")
          ? { "X-Confirm-Network": req.headers.get("x-confirm-network") ?? "" }
          : {}),
      },
      body,
    });
  } catch {
    return err(502, "upstream", "registrar API unreachable");
  }
  const type = res.headers.get("Content-Type") ?? "application/json";
  if (pub && res.ok) {
    const json = (await res.json().catch(() => null)) as unknown;
    return withSandboxCookie(
      NextResponse.json(json, { status: res.status }),
      path,
      json,
    );
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: { "Content-Type": type },
  });
}

export const POST = (req: Request, ctx: Ctx) => forward("POST", req, ctx);
export const PATCH = (req: Request, ctx: Ctx) => forward("PATCH", req, ctx);
export const DELETE = (req: Request, ctx: Ctx) => forward("DELETE", req, ctx);
