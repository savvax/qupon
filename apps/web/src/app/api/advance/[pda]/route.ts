import { NextRequest, NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";

/**
 * Server-side proxy for POST /actions/{pda}/advance. The registrar's
 * ADVANCE_TOKEN lives only here (server env) — never in NEXT_PUBLIC_*.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pda: string }> },
) {
  const { pda } = await params;
  // The pda goes into the upstream URL next to a bearer token: accept only a base58 address.
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pda)) {
    return NextResponse.json({ error: "invalid action address" }, { status: 400 });
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (process.env.ADVANCE_TOKEN) {
    headers.Authorization = `Bearer ${process.env.ADVANCE_TOKEN}`;
  }
  const res = await fetch(`${API_BASE_URL}/actions/${pda}/advance`, {
    method: "POST",
    headers,
    body: await request.text(),
  });
  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      "Content-Type": res.headers.get("Content-Type") ?? "application/json",
    },
  });
}
