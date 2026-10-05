import { NextResponse } from "next/server";
import {
  MOCK_SESSIONS,
  apiBase,
  sameOrigin,
  sessionToken,
} from "@/lib/session";
import { isAllowedWrite } from "../allowlist";

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/** Session proxy for back-office writes: JSON only, same origin, bearer from the httpOnly cookie. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  if (!isAllowedWrite(path)) return err(403, "forbidden_path", "not allowed");
  if (!(await sameOrigin(req.headers.get("origin"))))
    return err(403, "bad_origin", "bad origin");
  if (!req.headers.get("content-type")?.startsWith("application/json"))
    return err(415, "bad_content_type", "JSON only");
  const token = await sessionToken();
  if (!token) return err(401, "unauthenticated", "sign in required");
  if (MOCK_SESSIONS)
    return NextResponse.json({
      mock: true,
      signatures: [
        "MockSig1111111111111111111111111111111111111111111111111111111111111111111111111111111",
      ],
    });
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: await req.text(),
    });
  } catch (e) {
    return err(
      502,
      "upstream",
      `registrar API unreachable: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
