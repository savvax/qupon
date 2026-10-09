import { NextResponse } from "next/server";
import { LOCALES, toLocale } from "@/i18n/locale";
export async function POST(req: Request) {
  const { locale } = (await req.json().catch(() => ({}))) as {
    locale?: string;
  };
  if (toLocale(locale) !== locale)
    return NextResponse.json(
      { error: `locale must be one of ${LOCALES.join(", ")}` },
      { status: 400 },
    );
  const res = NextResponse.json({ ok: true });
  res.cookies.set("NEXT_LOCALE", locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  return res;
}
