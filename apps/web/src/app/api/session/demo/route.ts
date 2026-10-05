import { NextResponse } from "next/server";
import { safeNext } from "@/lib/boClient";
import { ROLE_HOME, type Role } from "@/lib/session";
import { startSession } from "../start";

/** JSON from the hydrated page, or a plain form post before hydration (then answer with a redirect). */
export async function POST(req: Request) {
  if (
    !req.headers
      .get("content-type")
      ?.includes("application/x-www-form-urlencoded")
  ) {
    return startSession(req, "/auth/demo");
  }
  const form = await req.formData();
  const json = new Request(req.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: req.headers.get("origin") ?? "",
    },
    body: JSON.stringify({ role: String(form.get("role") ?? "") }),
  });
  const res = await startSession(json, "/auth/demo");
  // Relative Location: behind the proxy req.url carries the internal host.
  const redirect = (to: string) =>
    new NextResponse(null, { status: 303, headers: { Location: to } });
  if (!res.ok) return redirect("/login?demo=failed");
  const { user } = (await res.json()) as { user: { role: Role } };
  const out = redirect(
    safeNext(String(form.get("next") ?? "")) ?? ROLE_HOME[user.role],
  );
  for (const c of res.cookies.getAll()) out.cookies.set(c);
  return out;
}
