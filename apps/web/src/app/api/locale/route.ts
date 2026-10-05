import { NextResponse } from "next/server";
export async function POST(req: Request) {
  const { locale } = (await req.json().catch(() => ({}))) as { locale?: string };
  if (locale !== "en" && locale !== "ru") return NextResponse.json({ error: "locale must be en or ru" }, { status: 400 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return res;
}
