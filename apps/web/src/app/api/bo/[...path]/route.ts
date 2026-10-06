import { NextResponse } from "next/server";
import { featureMock } from "@/mocks/features";
import {
  MOCK_SESSIONS,
  apiBase,
  sameOrigin,
  sessionToken,
} from "@/lib/session";
import { isAllowedWrite } from "../allowlist";

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

type Ctx = { params: Promise<{ path: string[] }> };

/** Session proxy for signed-in writes: JSON only, same origin, bearer from the httpOnly cookie. */
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
  const token = await sessionToken();
  if (!token) return err(401, "unauthenticated", "sign in required");
  const body = await req.text();
  if (MOCK_SESSIONS) {
    const feature = featureMock(method, `/${path}`, JSON.parse(body || "{}"));
    if (feature) return NextResponse.json(feature.value);
    return NextResponse.json({
      mock: true,
      signatures: [
        "MockSig1111111111111111111111111111111111111111111111111111111111111111111111111111111",
      ],
    });
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body,
    });
  } catch {
    return err(502, "upstream", "registrar API unreachable");
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}

export const POST = (req: Request, ctx: Ctx) => forward("POST", req, ctx);
export const PATCH = (req: Request, ctx: Ctx) => forward("PATCH", req, ctx);
export const DELETE = (req: Request, ctx: Ctx) => forward("DELETE", req, ctx);
