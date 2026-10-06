import { NextResponse } from "next/server";
import {
  MOCK_SESSIONS,
  apiBase,
  sameOrigin,
  sessionToken,
} from "@/lib/session";
import { isAllowedUpload } from "../../bo/allowlist";

const MAX_BYTES = 10 * 1024 * 1024 + 64 * 1024; // 10 MB file + multipart overhead

const err = (status: number, code: string, message: string) =>
  NextResponse.json({ code, message }, { status });

/** Session proxy for document uploads (multipart): same origin, size-capped, streamed to the registrar. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  if (!isAllowedUpload(path)) return err(403, "forbidden_path", "not allowed");
  if (!(await sameOrigin(req.headers.get("origin"))))
    return err(403, "bad_origin", "bad origin");
  const type = req.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data"))
    return err(415, "bad_content_type", "multipart/form-data only");
  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES)
    return err(413, "too_large", "documents are at most 10 MB");
  const token = await sessionToken();
  if (!token) return err(401, "unauthenticated", "sign in required");
  if (MOCK_SESSIONS) {
    const form = await req.formData();
    const file = form.get("file");
    return NextResponse.json(
      {
        document: {
          id: 900 + Math.floor(Math.random() * 99),
          kind: String(form.get("kind") ?? "other"),
          filename: file instanceof File ? file.name : "document",
          mime: file instanceof File ? file.type : "application/pdf",
          size: file instanceof File ? file.size : 0,
          seriesMint: null,
          createdAt: Math.floor(Date.now() / 1000),
        },
      },
      { status: 201 },
    );
  }
  let res: Response;
  try {
    res = await fetch(`${apiBase()}/${path}`, {
      method: "POST",
      headers: { "Content-Type": type, Authorization: `Bearer ${token}` },
      body: await req.arrayBuffer(),
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
