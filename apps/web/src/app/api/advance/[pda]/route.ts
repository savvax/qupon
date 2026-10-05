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
