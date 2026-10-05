import { NextResponse } from "next/server";
import {
  MOCK_SESSIONS,
  SESSION_COOKIE,
  apiBase,
  sessionToken,
} from "@/lib/session";

export async function POST() {
  const token = await sessionToken();
  if (token && !MOCK_SESSIONS) {
    await fetch(`${apiBase()}/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }
  const res = new NextResponse(null, { status: 204 });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
